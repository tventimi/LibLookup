import { app, BrowserWindow, ipcMain, Menu } from 'electron/main'
import { Z3950Client } from './Z3950Client.js';
import { Marc } from 'marcjs'
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'path';
import * as http from 'http'
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream'
import { shell } from 'electron'
import { Subject, finalize }  from 'rxjs'
import started from 'electron-squirrel-startup';
import * as csv from 'csv/sync'
import { stringify } from 'csv/sync'
import catalogs from './config/catalogs.json' with {"type": "json"}
import * as cheerio from 'cheerio'

if (started) app.quit();

Menu.setApplicationMenu(null);

const indexURL = 'http://localhost:3950/'


var latestQuery = ""
var resultsStream = new Subject()
var latestResultCount = 0
var latestResults = []
var displayResults = []
var displayFields = []
var resultSetID = ""
var catalogID = ""
var expectedResultCount = 50
var win
var z3950client

const createWindow = () => {  
  win = new BrowserWindow({
    width: 250,
    height: 400,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('config.html').then(() => {
    const headers = {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000 // 30 days
    }; 
    
    const serverOptions = {
      //key: fs.readFileSync('./webserver/server.key'),
      //cert: fs.readFileSync('./webserver/server.crt')
    };
    
    const server = http.createServer(serverOptions, (request, response) => {    
      if (request.method === 'OPTIONS') {
        response.writeHead(204, headers);
        response.end();
        return;
      } 

      var url = new URL(request.url, `http://${request.headers.host}`)
      var filename = url.pathname.replace(/^\/+/, '') || 'index.html'
      filename = app.isPackaged ? path.join(app.getAppPath(),filename) :  filename
      console.log(`Received request for ${filename}`) 
      fs.readFile(filename, (err, data) => {  
        if (err) {
          response.writeHead(404);
          response.end('404 Not Found');
          return;
        } 
        response.writeHead(200, headers);
        var outputDoc = cheerio.load(data.toString())
        var catalog = url.searchParams.get('catalog')
        var query = url.searchParams.get('q')
        var singleRecord = (url.searchParams.get('singleRecord') == 'true')
        var submittedDisplayFields = url.searchParams.get('displayFields')
        var format = url.searchParams.get('format') || 'html'
        var mode = url.searchParams.get('mode') || 'web' 
        if(submittedDisplayFields) {
          displayFields = submittedDisplayFields.split(',').map(f => f.trim())
        }
        if(format == 'html') { 
          if(filename.endsWith('index.html')) {      
            var catalogHTML = "" 
            var catalogList = outputDoc('#catalog')
            Object.keys(catalogs).forEach((cat) => {
              const catOption = `<option value='${cat}'>${catalogs[cat].name}</option>`
              catalogList.append(catOption)
            })
            if(mode == 'plugin') {
              outputDoc = outputDoc('#queryForm')
            }
          }
        }
        if(!filename.endsWith('.html')) {
          response.end(outputDoc.text())
          return
        }
        if(!(catalog && query)) { 
          response.end(outputDoc.html()) 
          return
        }

        resultSetID = "1"
        resultsStream.subscribe(
          results => {
            if(results == null) {
              if(format == 'html') {
                response.end(outputDoc.html())
              } else {
                response.end(outputDoc('#results').text())                 
              }
            } else if(results.count == 0) {
              if(format == 'html') {
                response.end("No results found")
              } else {
                response.end()
              }
            } else {              
              if(!Array.isArray(results)) {
                outputDoc('#results').append(renderMARC(results))
              } else {
                outputDoc("#resultCount").append(`Found ${latestResultCount} results`)
                outputDoc('#results').append(renderRecords([['001',...displayFields],...results],format))
              }
            }
          },                
        )
        if(singleRecord && displayResults.length > 0) {
          displayResults = latestResults.filter((rec) => {
            return rec.get('001')[0].value.includes(query.replace("@attr 1=12 ",""))
          })
          resultsStream.next(displayResults[0])
          resultsStream.next(null)
        } else {
          if(catalog != catalogID) {
            catalogID = catalog
            z3950Connect(catalogID)
          }
          z3950search(resultSetID, query)
        }      
      })   
    })
    server.listen(3950, 'localhost', () => {
      console.log('Electron app listening for HTTP calls on http://localhost:3950');
    });
  })  
}

app.whenReady().then(() => {
  if(!win) {
    createWindow()
  } 
})

function z3950callback(respType, respBody) {
  switch(respType) {
    case 'error':
      console.log(respBody)
      break;
    case 'searchResponse':
      var resultCount = respBody
      console.log(`${resultCount} results found`)
      latestResultCount = resultCount
      latestResults = []
      displayResults = []
      expectedResultCount = Math.min(resultCount,50)
      z3950client.getRecords(resultSetID, 1, expectedResultCount)
      break;
    case 'presentResponse':
      if(respBody == "") {
        resultsStream.next([])
        resultsStream.next(null)
      } else {
        var marcRecords = respBody.split("\x1D")
        marcRecords.pop()        
        for(var i = 0; i < marcRecords.length; i++) {
          var rec = Marc.parse(Buffer.from(marcRecords[i],'binary'),'iso2709')                    
          latestResults.push(rec)
          displayResults.push(rec)          
        }         
        if(latestResults.length == expectedResultCount) {          
          resultsStream.next(displayResults.map((rec) => {
            return filterRecordFields(rec,['001',...displayFields])
          })) 
          resultsStream.next(null)       
        } else {
          z3950client.getRecords(resultSetID,latestResults.length+1,expectedResultCount-latestResults.length)
        }
      }        
      break;
  }
}

function filterRecordFields(marc, fields = []) {
  var filteredFields = []
  if(fields.length > 0) {
    for(var i = 0; i < fields.length; i++) {
      var fi = marc.get(fields[i])[0]
      var val = ""
      if(fi) {
        if(fi.tag.startsWith("00")) {      
          val = fi.value
        } else {
          val = fi.subf.map((sf) => sf[1]).join(' ')
        }
        if(i == 0) {
          val = val.replace(/^[a-z]*/,"")
        }
      }
      filteredFields.push(val)
    }
  }
  return filteredFields
}

function renderRecords(records,format = 'html') {
  var rendered = ""
  if(format == 'json') {
    rendered += JSON.stringify(records)
  } else if(format == 'csv') {
    rendered += csv.stringify(records)
  } else if (format == 'html') {
    rendered += "<table class='marc'>"
    rendered += "<th>" + records[0].join("</th><th>") + "</th>"
    for(var i = 1; i < records.length; i++) {
      rendered += "<tr>"
      rendered += `<td><a href='index.html?singleRecord=true&catalog=${catalogID}` + 
            `&q=%40attr+1%3D12+${records[i][0]}&displayFields=${displayFields}'>${records[i][0]}</a></td>`
      rendered += "<td>" + records[i].slice(1).join("</td><td>") + "</td>"
      rendered += "</tr>"
    }
    rendered += "</table>"
  }
  return rendered
}

function renderMARC(marc) {
  var rec = "<table class='marc'>"
  rec += "<tr><td>LDR</td><td></td><td></td><td>" + marc.leader + "</td></tr>"
  marc.fields.forEach(f => {
    var tag = f[0]
    rec += "<tr><td>" + tag + "</td><td>" 
    var ind1 = ""
    var ind2 = ""
    var startIndex = 1
    if(!tag.match(/^00/)) {
      ind1 = f[1][0]
      ind2 = f[1][1]
      startIndex = 2
    }
    rec += ind1 + "</td><td>" + ind2 + "</td><td>"
    for(var i = startIndex; i < f.length; i++) { 
      var sf = f[i]
      if(sf.length == 1) {
        rec += "$" 
      }   
      rec += sf + " "
    }
    rec += "</td></tr>"
  })          
  rec += "</table>" 
  return rec
}

function z3950Connect(catalog) {
  var i = 1
  var host = catalogs[catalog].host
  var port = catalogs[catalog].port
  var database = catalogs[catalog].database
  var username = catalogs[catalog].username ?? ""
  var password = catalogs[catalog].password ?? ""

  if(z3950client?.isConnected()) {
    z3950client.disconnect()
  }
  z3950client = new Z3950Client(port, host, database, username, password)
  z3950client.connect(z3950callback)
}

function z3950search(resultSetID, query) {
  latestQuery = query
  if(!z3950client?.isConnected()) {
    z3950Connect(catalogID)
    var interval = setInterval(() => {
      if(z3950client.isConnected()) {
          clearInterval(interval)
          z3950client.query(resultSetID, query)
      }
    },1000)
  } else {
    z3950client.query(resultSetID, query)
  }
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()    
  }
})
  
app.on('window-all-closed', () => {
  if(z3950client?.isConnected()) {
    z3950client.disconnect()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('button-clicked', (event) => {
    shell.openExternal(indexURL)
});
