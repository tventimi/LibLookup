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
import catalogs from './config/catalogs.json' with {"type": "json"}

if (started) app.quit();

Menu.setApplicationMenu(null);

var queries = []
var resultsDisplay = new Subject()
var latestResults = []
var displayResults = []
var displayFields = []
var resultSetID = ""
var catalogID = "WorldCat"
var expectedResultCount = 50
var win
var z3950client

const createWindow = () => {  
  win = new BrowserWindow({
    width: 300,
    height: 400,
    webPreferences: {
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.js'),
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
    
    const server = http.createServer(serverOptions, (req, res) => {    
      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
      } else {
        var url = new URL(req.url, `http://${req.headers.host}`)
        var filename = url.pathname.replace(/^\/+/, '') || 'index.html'
        filename = (app.isPackaged ? app.getAppPath() + '/' : "") + filename
        console.log(`Received request for ${filename}`) 
        fs.readFile(filename, (err, data) => {  
          if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
          } else {  
            res.writeHead(200, headers);
            var output = data.toString()
            output = output.replace('renderer.js', 'webrenderer.js')
            var catalog = url.searchParams.get('catalog')
            var query = url.searchParams.get('q')
            var singleRecord = url.searchParams.get('singleRecord')
            var submittedDisplayFields = url.searchParams.get('displayFields')
            if(submittedDisplayFields) {
              displayFields = submittedDisplayFields.split(',').map(f => f.trim())
            }
            res.write(output)
            if(catalog && query) {
              resultSetID = "1"
              resultsDisplay.subscribe(
                rec => {
                  res.end(rec)
                },                
              )
              if(singleRecord == "true" && displayResults.length > 0) {
                displayResults = latestResults.filter((rec) => {
                  return rec.get('001')[0].value.includes(query.replace("@attr 1=12 ",""))
                })
                resultsDisplay.next("<table class='marc'>" + 
                  renderMARC(displayResults[0]) + "</table>")
              } else {
                if(catalog != catalogID) {
                  catalogID = catalog
                  z3950Connect(catalogID)
                }
                z3950search(resultSetID, query)
              }
            } else {
              res.end()
            } 
          }        
        })   
      }             
    })
    server.listen(3950, 'localhost', () => {
      console.log('Electron app listening for HTTPS calls on http://localhost:3950');
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
      latestResults = []
      displayResults = []
      expectedResultCount = Math.min(resultCount,50)
      z3950client.getRecord(resultSetID, 1, expectedResultCount)
      break;
    case 'presentResponse':
      if(respBody == "") {
        resultsDisplay.next("No record found.")
      } else {
        var marcRecords = respBody.split("\x1D")
        marcRecords.pop()        
        for(var i = 0; i < marcRecords.length; i++) {
          var rec = Marc.parse(Buffer.from(marcRecords[i],'binary'),'iso2709')                    
          latestResults.push(rec)
          displayResults.push(rec)          
        }         
        if(latestResults.length == expectedResultCount) {
          var records = "<table class='marc'>"
          if(displayResults.length == 1) {
            records += renderMARC(displayResults[0])
          } else {
            records += "<tr><th>" + ['001',...displayFields].join("</th><th>") + "</tr>"
            records += displayResults.map((rec) => {
              return renderMARC(rec,['001',...displayFields])
            }).join("")
          }
          records += "</table>"
          resultsDisplay.next(records)        
        } else {
          z3950client.getRecord(resultSetID,latestResults.length+1,expectedResultCount-latestResults.length)
        }
      }        
      break;
  }
}

function renderMARC(marc, fields = []) {
  var rec = ""
  if(fields.length > 0) {
    rec += "<tr>"
    for(var i = 0; i < fields.length; i++) {
      rec += "<td>" 
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
          val = `<a href='index.html?singleRecord=true&catalog=${catalogID}` + 
            `&q=%40attr+1%3D12+${val}&displayFields=${displayFields}'>${val}</a>`
        }
      }
      rec += val
      rec += "</td>"
    }
    rec += "</tr>"
  } else {
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
  }
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
  z3950client.disconnect()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('button-clicked', (event) => {
    shell.openExternal('http://localhost:3950/')
});
