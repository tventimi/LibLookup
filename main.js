import { app, BrowserWindow, ipcMain, Menu } from 'electron/main'
import { Z3950Client } from './Z3950Client.js';
import { Marc } from 'marcjs'
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'path';
import * as https from 'https'
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream'
import { shell } from 'electron'
import { Subject, finalize }  from 'rxjs'
import started from 'electron-squirrel-startup';
import * as csv from 'csv/sync'
import { stringify } from 'csv/sync'
import catalogs from './config/catalogs.json' with {"type": "json"}
import * as cheerio from 'cheerio'
import { start } from 'node:repl';

if (started) app.quit();

Menu.setApplicationMenu(null);

const libLookupDomain = 'localhost'
const libLookupPort = 3950
const baseURL = `https://${libLookupDomain}:${libLookupPort}/`
const defaultPageSize = 50

var resultsPerPage = defaultPageSize
var latestQuery = ""
var resultsStream = new Subject()
var requestStream = new Subject()
var latestResultCount = 0
var latestResults = []
var displayResults = []
var displayFields = []
var resultSetID = ""
var catalogID = ""
var startAtRecord = 1
var expectedResultCount = defaultPageSize
var win
var z3950client

const createWindow = () => {  
  win = new BrowserWindow({
    width: 200,
    height: 370,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('config.html').then(() => {
    var headers = {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': 2592000 // 30 days
    }; 
    
    const serverOptions = {
      key: fs.readFileSync(
        app.isPackaged ? path.join(app.getAppPath(),'./webserver/server.key') :  './webserver/server.key'),
      cert: fs.readFileSync(
        app.isPackaged ? path.join(app.getAppPath(),'./webserver/server.crt') :  './webserver/server.crt')
    };
    

    var serverReady = true
    requestStream.subscribe((reqResp) => {
      var requestInterval = setInterval(() => {
        if(serverReady == true) {
          serverReady = false
          var request = reqResp.req
          var response = reqResp.resp
          if (request.method === 'OPTIONS') {
            response.writeHead(204, headers);
            response.end();
            serverReady = true
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
              serverReady = true
              return;
            } 
            if(filename.endsWith('png')) {
              headers['Content-Type'] = 'image/png'
              response.writeHead(200, headers);
              response.end(data)
              return
            }
            response.writeHead(200, headers);
            var outputDoc = cheerio.load(data.toString())
            var catalog = url.searchParams.get('catalog')
            var query = decodeURIComponent(url.searchParams.get('q'))
            var singleRecord = (url.searchParams.get('singleRecord') == 'true')
            var submittedDisplayFields = url.searchParams.get('displayFields')
            var format = url.searchParams.get('format') || 'html'
            var pageType = url.searchParams.get('pageType') || 'web' 
            startAtRecord = +(url.searchParams.get('start') || 1)
            var maxRecs = +(url.searchParams.get('maxRecs') || defaultPageSize)
            resultsPerPage = Math.min(maxRecs,defaultPageSize)

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
                if(pageType != "plugin") {
                  outputDoc('.plugin-only').remove()
                }             
              }              
            }
            if(!filename.endsWith('.html')) {
              response.end(outputDoc.text())
              serverReady = true
              return
            }
            if(!(catalog && query)) {   
              if(pageType == 'plugin') {                     
                outputDoc('*').each((index, element) => {
                  if(outputDoc(element).attr('href')) {
                    var newLink = outputDoc(element).attr('href').replaceAll('./',baseURL)
                    outputDoc(element).attr('href',newLink)
                  }
                  if(outputDoc(element).attr('src')) {
                    var newSrc = outputDoc(element).attr('src').replaceAll('./',baseURL)
                    outputDoc(element).attr('src',newSrc)
                  }
                })           
                var formHTML = outputDoc('#queryForm').html()
                response.end(`<form id="queryForm">${formHTML}</form>`) 
              } else {
                outputDoc('.plugin-only').remove()
                response.end(outputDoc.html())
              }
              serverReady = true
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
                  serverReady = true
                } else if(results.count == 0) {
                  if(format == 'html') {
                    response.end("No results found")
                  } else {
                    response.end()
                  }
                  serverReady = true
                } else {              
                  if(!Array.isArray(results)) {
                    outputDoc('#results').append(renderMARC(results))
                  } else {
                    var navbar = outputDoc("#navigation")
                    if(startAtRecord > 1) {
                      var prevURL = new URL(url)
                      prevURL.searchParams.set('start',Math.max(startAtRecord - resultsPerPage,1))
                      navbar.append(`<a href='index.html${prevURL.search}'>Previous ${resultsPerPage}</a>&nbsp;&nbsp;`)
                    }
                    if(startAtRecord + displayResults.length <= latestResultCount) {
                      var nextURL = new URL(url)
                      nextURL.searchParams.set('start',startAtRecord + resultsPerPage)
                      navbar.append(`<a href='index.html${nextURL.search}'>Next ${resultsPerPage}</a>`)
                    }
                    outputDoc("#resultCount").append(`Displaying ${startAtRecord} to ${startAtRecord + displayResults.length - 1} of ${latestResultCount} results`)
                    outputDoc('#results').append(renderRecords([['001',...displayFields],...results],format))
                  }
                }
              }                
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
                latestQuery = ""
                z3950Connect(catalogID)
              } 
              z3950search(resultSetID, query)         
            }      
          })
          clearInterval(requestInterval)
        }
      },100) 
    })

    const server = https.createServer(serverOptions, (request, response) => { 
      requestStream.next({req: request, resp: response})               
    })
    server.listen(libLookupPort, libLookupDomain, () => {
      console.log(`Electron app listening for HTTP calls on https://${libLookupDomain}:${libLookupPort}`);
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
      expectedResultCount = Math.min(resultCount-startAtRecord+1,resultsPerPage)
      z3950client.getRecords(resultSetID, startAtRecord, expectedResultCount)
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
          z3950client.getRecords(resultSetID,startAtRecord+latestResults.length,expectedResultCount-latestResults.length)
        }
      }        
      break;
  }
}

function filterRecordFields(marc, fields = []) {
  var filteredFields = []
  if(fields.length > 0) {
    for(var i = 0; i < fields.length; i++) {
      var tag = fields[i].substring(0,3).replaceAll('x','.')
      var sf = fields[i].substring(3)  || "" 
      var fi = marc.get(new RegExp(`^${tag}`))[0]
      var val = ""
      if(fi) {
        if(tag.startsWith("00")) {      
          val = fi.value
        } else {
          var selectedSubfields = fi.subf
          if(sf.includes("=")) {
            var selected880s = marc.get('880').filter((field) => 
              field.subf.filter((subfield) => 
                subfield[0] == '6' && subfield[1].startsWith(tag)
              ).length > 0
            )
            selectedSubfields = selected880s.length > 0 ? selected880s[0].subf : []            
            sf = sf.replaceAll('=','')
          }

          if(sf != "") {
            selectedSubfields = selectedSubfields.filter((subfield) => (sf.includes(subfield[0])))
          } else {
            selectedSubfields = selectedSubfields.filter((subfield) => (!'0123456789'.includes(subfield[0])))
          }
          val = selectedSubfields.map((subfield) => subfield[1]).join(' ')
        }
        if(tag == '001') {
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
    var recordsAndCount = {numberOfRecords: latestResultCount, records: records}
    if(startAtRecord + resultsPerPage < latestResultCount) {
      recordsAndCount.nextRecordPosition = startAtRecord + resultsPerPage
    }    
    rendered += JSON.stringify(recordsAndCount)
  } else if(format == 'csv') {
    rendered += csv.stringify(records)
  } else if (format == 'html') {
    rendered += "<table class='marc'><th></th>"
    rendered += "<th>" + records[0].slice(1).join("</th><th>") + "</th>"
    for(var i = 1; i < records.length; i++) {
      rendered += "<tr>"
      rendered += `<td><a href='index.html?singleRecord=true&catalog=${catalogID}` + 
            `&q=%40attr+1%3D12+${records[i][0]}&displayFields=${displayFields}'>View</a></td>`
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

function callSearchOrCache(resultSetID, query) {
  latestResults = []
  displayResults = []      
  if(latestQuery == query && z3950client.isConnected()) {
    console.log('cache')
    expectedResultCount = Math.min(resultsPerPage,latestResultCount-startAtRecord+1)
    z3950client.getRecords(resultSetID,startAtRecord,expectedResultCount)
  } else {
    console.log('search')
    z3950client.query(resultSetID, query)
  }
  latestQuery = query
}

function z3950search(resultSetID, query) {
  if(z3950client?.isConnected()) {
    callSearchOrCache(resultSetID,query)
  } else {
    z3950Connect(catalogID)
    latestQuery = ""
    var interval = setInterval(() => {
      if(z3950client.isConnected()) {
        callSearchOrCache(resultSetID,query)      
        clearInterval(interval)                
      }
    },1000)
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
    shell.openExternal(baseURL)
});
