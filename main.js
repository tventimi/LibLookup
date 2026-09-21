import { app, BrowserWindow, ipcMain, Menu } from 'electron/main'
import { Z3950Client } from './Z3950Client.js';
import { SRUClient } from './SRUClient.js';
import { CustomClient } from './CustomClient.js';
import { MenuMap } from './MenuMap.js'
import { Marc } from 'marcjs'
import * as fs from 'node:fs';
import * as path from 'path';
import * as https from 'https'
import { shell, dialog } from 'electron'
import { Subject }  from 'rxjs'
import * as csv from 'csv/sync'
import * as cheerio from 'cheerio'
import autoUpdaterPkg from 'electron-updater';
import { JSONPath } from 'jsonpath-plus'
import { decode } from 'html-entities';
const { autoUpdater } = autoUpdaterPkg;

const appLock = app.requestSingleInstanceLock();
if (!appLock) {
  // Another instance is already running, quit this one immediately
  app.quit();
}

Menu.setApplicationMenu(null);

const libLookupDomain = 'localhost'
const libLookupPort = 3950
const baseURL = `https://${libLookupDomain}:${libLookupPort}/`
const configFileName = "catalogs.json"
const defaultPageSize = 50
const intervalLength = 100 //100ms
const wcHoldingsLimit = 1600

var resultsPerPage = defaultPageSize
var latestQuery = ""
var resultsStream = new Subject()
var requestStream = new Subject()
var latestResultCount = 0
var latestResults = []
var displayResults = []
var displayFields = []
var menuMap = {}

var catalogs = null
var catalogID = ""
var catalogLink = ""
var startAtRecord = 1
var win
var z3950client
var sruClient
var customClient
var server

const defaultResults = [
    {name:"Record ID",code:"recno",value:"001"},
    {name:"Title",code:"title",value:"245"},
    {name:"Author",code:"author",value:"1xx"},
    {name:"Publication Date",code:"date",value:"26xc"},
    {name:"Other...",code:"other",value:""}
]

autoUpdater.autoDownload = false;

const createWindow = () => {  
  win = new BrowserWindow({
    width: 300,
    height: 500,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loadConfigJSON()

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
        if(!serverReady) {
          return
        }
        serverReady = false
        var request = reqResp.req
        var response = reqResp.resp
        if (request.method === 'OPTIONS') {
          response.writeHead(204, headers);
          response.end();
          serverReady = true
          return;
        } 

        var url = new URL(request.url, `https://${request.headers.host}`)
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
            var imageHeaders = { ...headers }
            imageHeaders['Content-Type'] = 'image/png'
            response.writeHead(200, imageHeaders);
            response.end(data)
            serverReady = true
            return
          } 
          response.writeHead(200, headers);
          if(!catalogs) {
            response.end("No catalogs have been configured in LibLookup.  Please load a configuration file in the desktop app.")
            serverReady = true
            return
          }
          var outputDoc = cheerio.load(data.toString())
          var catalog = url.searchParams.get('catalog')
          catalogLink = ""
          var query = decodeURIComponent(url.searchParams.get('q'))
          var singleRecord = (url.searchParams.get('singleRecord') == 'true')
          var format = url.searchParams.get('format') || 'html'
          var submittedDisplayFields = url.searchParams.get('displayFields')            
          var pageType = url.searchParams.get('pageType') || 'web' 
          startAtRecord = +(url.searchParams.get('start') || 1)
          var maxRecs = +(url.searchParams.get('maxRecs') || defaultPageSize)
          resultsPerPage = Math.min(maxRecs,defaultPageSize)
          
          if(submittedDisplayFields) {
            displayFields = submittedDisplayFields.split('|').map(f => f.trim())
          } 
  
          if(format == 'html') { 
            if(filename.endsWith('index.html')) {      
              var catalogList = outputDoc('#catalog')
              Object.keys(catalogs).forEach((cat) => {
                const catOption = `<option value='${cat}'>${catalogs[cat].name}</option>`
                catalogList.append(catOption)
              })
              var menuJSON = outputDoc('#menumap')
              menuJSON.append(menuMap.getJSON())
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
          var resultsSubscription = resultsStream.subscribe(
            results => {
              if(results == null) {
                if(format == 'html') {
                  response.end(outputDoc.html())
                } else {
                  response.end(outputDoc('#results').text().replace(/^\s*/s,''))                 
                }
                serverReady = true
                resultsSubscription.unsubscribe()
              } else if(results.length == 0) {
                if(format == 'html') {
                  outputDoc('#resultsPanel').removeClass('hidden')
                  outputDoc('.downloadButton').addClass('hidden')
                  outputDoc("#results").append("No results found")
                } else {
                  outputDoc("#results").append(renderRecords([['001',...displayFields]],format))
                }
                serverReady = true
              } else {              
                outputDoc('#resultsPanel').removeClass('hidden')
                if(catalogs[catalog].resultFormat == 'json') {
                  outputDoc('#downloadMRC').addClass('hidden')
                }
                if(singleRecord) {   
                  if(format == 'html') {
                    outputDoc('#downloadCSV').addClass('hidden')    
                    outputDoc('#abortButton').addClass('hidden')   
                    outputDoc('#downloadStatus').addClass('hidden')
                    var output = (catalogs[catalog].resultFormat == 'json') ? 
                      '<pre>' + JSON.stringify(results[0],null,2) + "</pre>" : 
                      renderMARC(results[0])             
                    outputDoc('#results').append(output)
                    return
                  } 
                }                 
                if(catalogLink != "") {
                  outputDoc('#catalogLink').append(`<a target="_blank" href="${catalogLink}">View in Catalog</a>`)
                }
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
                if(format == "mrc") {
                  var rawMRC = results.map((rec) => {
                    return escapeHtml(rec.as('iso2709'))
                  })
                  outputDoc('#results').append(rawMRC)
                } else {
                  var recIdField = (catalogs[catalog].resultFormat == 'json') ? catalogs[catalog].recIdField : '001'
                  var resultsTable = results.map(rec => {
                    if(catalogs[catalog].resultFormat == 'json') {
                      return filterJSONRecord(rec,[recIdField,...displayFields],catalogs[catalog].resultFields) 
                    } else {
                      return filterRecordFields(rec,[recIdField,...displayFields],catalogs[catalog].resultFields)
                    }
                  })
                  outputDoc('#results').append(renderRecords([[recIdField,...displayFields],...resultsTable],format))
                }
              }
            },
            error => {
              console.log(error)
              if(format == 'html') {
                outputDoc('#resultsPanel').removeClass('hidden')
                outputDoc('.downloadButton').addClass('hidden')
                outputDoc("#results").append(error)
                response.end(outputDoc.html())
              } else {
                response.end(error)
              }
              serverReady = true
              resultsSubscription.unsubscribe()
              resultsStream = new Subject()
            }                
          )
          if(singleRecord && displayResults.length > 0) {
            displayResults = latestResults.filter((rec) => {
              if(catalogs[catalog].resultFormat == 'json') {
                return Object.hasOwn(rec,'id') && rec.id.includes(decodeURIComponent(query)
                        .replace(/.*recno = "?([^&"]+).*/,"$1"))
              } else {
                return rec.get('001').length > 0 && 
                      rec.get('001')[0].value.includes(decodeURIComponent(query)
                        .replace(/.*recno = "?([^&"]+).*/,"$1"))
              }       
            })
            if(displayResults.length == 1) {
              resultsStream.next([displayResults[0]])
              resultsStream.next(null)
              return
            }
          }

          try {
            const catalogType = catalogs[catalog].type
            if(catalogType == "custom") {
              customClient = new CustomClient(catalogs[catalog])
              customClient.connect().then((success) => {
                if(success) {
                  var calculateCount = !((catalogID == catalog) && (query == latestQuery))
                  catalogID = catalog
                  latestResults = []
                  displayResults = []
                  customClient.query(query,startAtRecord,maxRecs,calculateCount).then((results) => {
                    if(calculateCount) {
                      latestResultCount = results.numberOfRecords
                    }
                    catalogLink = customClient.getCatalogLink()
                    latestQuery = query
                    for(var i = 0; i < results.records.length; i++) {
                      var rec = results.records[i]
                      if(catalogs[catalog].resultFormat != 'json') {
                        rec = Marc.parse(results.records[i],'marcxml')
                      }                  
                      latestResults.push(rec)
                      displayResults.push(rec)          
                    }                   
                    resultsStream.next(displayResults)
                    resultsStream.next(null)
                  })
                } else {
                  resultsStream.error('Cannot connect to catalog "' + catalogs[catalog]?.name + '". Please check your configuration or try again later.')
                }
              })
            } else if(catalogType == "almasru") {
              if(catalog != catalogID) {
                sruClient = new SRUClient(catalogs[catalog])
              }
              const holdingsFields = catalogs[catalog].resultFields?.filter(
                res => res.value.includes('isohold:')
              ).map(res => res.code)
              const includeHoldings = (holdingsFields &&
                holdingsFields.filter(field => submittedDisplayFields.includes(field)).length > 0)

              sruClient.connect().then((success) => {
                if(success) {
                  catalogID = catalog
                  latestQuery = query
                  latestResults = []
                  displayResults = []

                  sruClient.query(query,startAtRecord,maxRecs,includeHoldings).then((results) => {
                    latestResultCount = results.numberOfRecords                  
                    for(var i = 0; i < results.records.length; i++) {
                      var rec = Marc.parse(results.records[i],'marcxml')    
                     if(results.holdings?.length > 0) {
                        results.holdings[i].forEach(hold => {
                         rec.append(['HOL','  ','a',hold])
                       })
                     }    
                     latestResults.push(rec)
                     displayResults.push(rec)          
                   } 
                   resultsStream.next(displayResults)
                   resultsStream.next(null)
                  })
                } else {
                  resultsStream.error('Cannot connect to catalog "' + catalogs[catalog]?.name + '". Please check your configuration or try again later.')
                }
              }).catch((err) => {
                console.log(err)
              })
            } else if(catalogType == "z3950") {
              if(catalog != catalogID || !z3950client?.isConnected()) {
                catalogID = catalog
                latestQuery = ""
                z3950client = new Z3950Client(catalogs[catalog])
                z3950client.connect()
              } 
              var includeWCH = includeWorldCatHoldings(catalogs[catalog],displayFields)
              var awaitingResults = false
              var fullRecordStart = 0
              z3950client.elementSet = "F"
              catalogID = catalog
              latestQuery = query
              latestResults = []
              displayResults = [] 
              
              var interval = setInterval(async () => {
                if(z3950client.latestError != "" && z3950client.latestError != "wcholdingslimit") {
                  resultsStream.error('Cannot connect to catalog "' + catalogs[catalog]?.name + '". Please check your configuration or try again later.')
                  clearInterval(interval)  
                }
                if(z3950client?.isConnected() && !awaitingResults) {                   
                  awaitingResults = true    
                  z3950client.query(query,startAtRecord+fullRecordStart,maxRecs-fullRecordStart).then((results) => {
                    if(z3950client.latestError == "wcholdingslimit") {
                      z3950client.elementSet = "F"
                    } else {
                      if(z3950client.elementSet == "F") {
                        latestResultCount = results.numberOfRecords      
                      }       
                      for(var i = 0; i < results.records.length; i++) {
                        var rec = Marc.parse(Buffer.from(results.records[i],'binary'),'iso2709')    
                        if(z3950client.elementSet == "F") {
                          latestResults.push(rec)
                          displayResults.push(rec)  
                          if(includeWCH) {                                        
                            var wcHoldingsSummary = rec.get('948')[0].subf[0][1]
                            var m = wcHoldingsSummary.match(/([0-9]+) OTHER HOLDINGS/)   
                            var wcHoldingsCount = m[1]
                            if(wcHoldingsCount > wcHoldingsLimit) {
                              fullRecordStart = i+1
                            }
                          }
                        } else if(z3950client.elementSet == "FA") {                          
                          var wcHoldings = rec.get('948')                       
                          for(var j = 0; j < wcHoldings.length; j++) {   
                            var new948 = [wcHoldings[j].tag, wcHoldings[j].ind1 + wcHoldings[j].ind2, ...wcHoldings[j].subf.flat()]                
                            latestResults[i+fullRecordStart].append(new948)
                          }
                        }
                      }
                      if(includeWCH && z3950client.elementSet == "F") {
                        z3950client.elementSet = "FA"
                      } else {
                        resultsStream.next(displayResults)
                        resultsStream.next(null)
                        clearInterval(interval)
                      } 
                      awaitingResults = false
                    }              
                  })  
                }              
              },100)
            }
          } catch {
            resultsStream.next([])
            resultsStream.next(null)
          }            
        })
        clearInterval(requestInterval)
      },intervalLength) 
    })

    server = https.createServer(serverOptions, (request, response) => { 
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
    autoUpdater.checkForUpdatesAndNotify();
  } 
})

function includeWorldCatHoldings(catalogConfig,displayFields) {
  if(catalogConfig.host != 'zcat.oclc.org' || catalogConfig.database != 'OLUCWorldCat') {
    return false
  }
  var mapping = catalogConfig.resultFields ?? []
  for(var i = 0; i < displayFields.length; i++) {
    var filtermap = mapping.filter(m => m.code == displayFields[i].toLowerCase())
    var field = (filtermap.length > 0) ? filtermap[0].value : displayFields[i]
    if(field.match(/^948\$?[a-z]*[a-gi-z][a-z]*/)) {
      return true
    }
  }
  return false
}
function filterJSONRecord(jsonRecord,fields = [],mapping = []) {
  var filteredFields = []
  if(fields.length > 0) {
    for(var i = 0; i < fields.length; i++) {
      var fieldspec = fields[i].toLowerCase()
      var filtermap = mapping.filter(m => m.code == fieldspec)
      if(filtermap.length > 0) {
        fieldspec = filtermap[0].value
      } else {
        fieldspec = fields[i]
      }
      jsonRecord = convertEmbeddedJSON(jsonRecord)
      var val = JSONPath({path:fieldspec, json:jsonRecord})[0] ?? ""      
      if(Array.isArray(val)) {
        val = val.join("\xA6")
      }
      if(typeof val == 'object') {
        val = JSON.stringify(val)
      }
      filteredFields.push(val)
    }
  }
  return filteredFields
}

function convertEmbeddedJSON(jsonRecord) {
  var jsonString = JSON.stringify(jsonRecord)
  var embeddedObjects = jsonString.match(/"\{\\"[^}]*\}"/g)
  if(embeddedObjects) {
    for(var i = 0; i < embeddedObjects.length; i++) {
      jsonString = jsonString.replace(embeddedObjects[i],embeddedObjects[i]
          .replaceAll('\\"','"').replace(/^"/,'').replace(/"$/,''))
    }
  } 
  return JSON.parse(jsonString)
}

function filterRecordFields(marc, fields = [],mapping = []) {
  var filteredFields = []
  if(fields.length > 0) {
    for(var i = 0; i < fields.length; i++) {
      var fieldspec = fields[i].toLowerCase()
      var filtermap = mapping.filter(m => m.code == fieldspec)
      if(filtermap.length > 0) {
        fieldspec = filtermap[0].value
      } else {
        fieldspec = fields[i]
      }

      if(fieldspec.includes('isohold:')) {
        var holdingsFields = marc.get('HOL')
        holdingsFields = holdingsFields.map(hold => {          
          return SRUClient.extractIsoHoldFields(hold.subf[0][1],fieldspec)
        })
        filteredFields.push(holdingsFields.map(items => items.join("\xA6")).join("\xA6"))
        continue;
      }

      var tag = fieldspec.substring(0,3).replaceAll(/[Xx]/g,'.')
      var sf = fieldspec.substring(3) || "" 
      var substart = undefined
      var subend = undefined
      var match = sf.match(/\(([0-9]+)-([0-9]+)\)/)
      if(match) {
        substart = parseInt(match[1])
        subend = parseInt(match[2])
        sf.replace(match[0],"")
      }
      match = sf.match(/\((-?[0-9]+)\)/)
      if(match) {
        substart = parseInt(match[1])
      }
       

      var filter = ""
      match = sf.match(/#(.*)$/)
      if(match) {
        filter = match[1]
        sf = sf.replace(/#.*$/,"")
      }
      var fields_i = marc.get(new RegExp(`^${tag}`))

      if(tag == 'LDR') {
        fields_i = marc.leader
      }
      var val = ""
      if(fields_i.length > 0) { 
        if(tag == 'LDR') {
          val = fields_i
          val = applyAdditionalFilters(val,substart,subend,filter)
        } else if(tag.startsWith("00")) {      
          val = fields_i[0].value
          val = applyAdditionalFilters(val,substart,subend,filter)
        } else {
          var selectedSubfields = fields_i.map(field => field.subf)
          if(sf.includes("=")) {
            var selected880s = marc.get('880').filter((field) => 
              field.subf.filter((subfield) => 
                subfield[0] == '6' && subfield[1].startsWith(tag)
              ).length > 0
            )
            selectedSubfields = selected880s.length > 0 ? selected880s.map(field => field.subf) : []            
            sf = sf.replaceAll('=','')
          }

          if(sf != "") {
            selectedSubfields = selectedSubfields.map(
              sflist => sflist.filter(
                subfield => (sf.includes(subfield[0]))
              )
            )
          } else {
            selectedSubfields = selectedSubfields.map(
              sflist => sflist.filter(
                subfield => (!'0123456789'.includes(subfield[0]))
              )
            )
          }
          
          selectedSubfields = selectedSubfields.map(
            sflist => sflist.map(
              subfield => subfield[1]
            ).join(' ')
          ).map(
            field => applyAdditionalFilters(field,substart,subend,filter)
          ).filter(
            field => (field != "")
          )
          val = selectedSubfields.join("\xA6")            
        }        
      }
      filteredFields.push(val)
    }
  }
  return filteredFields
}

function applyAdditionalFilters(value, substart,subend,filter) {
  if(substart != undefined && subend != undefined) {
    value = value.substring(substart,subend+1)
  } else if(substart != undefined) {
    value = value.slice(substart)
  } 
  if(filter.match(/\/.*\//)) {
    try {
      var regex = new RegExp(filter.substring(1,filter.length-1))
      value = value.match(regex) ? value : ""
    } catch(e) {
      console.log(e)
    }
  } else {
    value = value.includes(filter) ? value : ""
  }
  return value
}

function renderRecords(records,format = 'html') {
  var rendered = ""
  if(format == 'json') {
    var recordsAndCount = {numberOfRecords: latestResultCount, catalogLink: catalogLink, records: records}
    if(startAtRecord + resultsPerPage < latestResultCount) {
      recordsAndCount.nextRecordPosition = startAtRecord + resultsPerPage
    }    
    rendered += escapeHtml(JSON.stringify(recordsAndCount))
  } else if(format == 'csv') {
    rendered += escapeHtml(csv.stringify(records.map(row => row.map(cell => decode(cell)))))
  } else if (format == 'html') {
    records = records.map(row => row.map(cell => decode(cell)))
    if(records[0].length > 6) {
      for(var i = 1; i < records.length; i++) {
        rendered += `<div class='viewlink'><a href='index.html?singleRecord=true&catalog=${catalogID}` + 
              `&q=recno+%3D+%22${records[i][0]}%22&displayFields=${displayFields.join("|")}'>View Full Record</a></div>`
        rendered += "<table class='marc'>"
        records[i] = records[i].map(rec => escapeHtml(rec))
        for(var j = 1; j < records[i].length; j++) {
          rendered += "<tr>"
          rendered += "<td>" + records[0][j] + "</td>"
          rendered += "<td>" + records[i][j] + "</td>"
          rendered += "</tr>"
        }
        rendered += "</table><hr/>"      
      }
      rendered = rendered.replaceAll("\xA6","<br/>") 
    } else {
      rendered += "<table class='marc'><th class='viewlink'></th>"
      rendered += "<th>" + records[0].slice(1).join("</th><th>") + "</th>"
      for(i = 1; i < records.length; i++) {
        records[i] = records[i].map(rec => escapeHtml(rec))
        rendered += "<tr>"
        rendered += `<td class='viewlink'><a href='index.html?singleRecord=true&catalog=${catalogID}` + 
            `&q=recno+%3D+%22${records[i][0]}%22&displayFields=${displayFields.join("|")}'>View</a></td>`
        rendered += "<td>" + records[i].slice(1).join("</td><td>") + "</td>"
        rendered += "</tr>"
      }
      rendered += "</table>"
      rendered = rendered.replaceAll("\xA6","<br/>")
    }    
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
      rec += escapeHtml(sf) + " "
    }
    rec += "</td></tr>"
  })          
  rec += "</table>" 
  return rec
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}

function loadConfigJSON() {
  const filePath = path.join(app.getPath('userData'), configFileName); 
  try {   
    const data = fs.readFileSync(filePath)
    catalogs = JSON.parse(data);

    const catkeys = Object.keys(catalogs)

    for(var i = 0; i < catkeys.length; i++) {
      if(!Object.hasOwn(catalogs[catkeys[i]],'resultFields')) {
        catalogs[catkeys[i]].resultFields = defaultResults
      }
    }
    menuMap = new MenuMap(catalogs)
  } catch(error) {
    console.error("Failed to read JSON file:", error)
  }
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()  
    autoUpdater.checkForUpdatesAndNotify();
  }
})

app.on('close', () => {
  server.close(() => {
    console.log('server closed')
  })
})
  
app.on('window-all-closed', () => {
  if(z3950client?.isConnected()) {
    z3950client.disconnect()
  }
  app.quit()
})

ipcMain.on('button-clicked', () => {
    shell.openExternal(baseURL)
});

ipcMain.handle('get-catalog-list', async () => {
  if(!catalogs) {
    return null
  } else {
    return Object.keys(catalogs).map(catcode => catalogs[catcode].name)
  }
})

ipcMain.handle('select-config-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],  
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return null; 
  } else {
    return result.filePaths[0]; 
  }
});

ipcMain.handle('load-config-file', async (event, sourceFilePath) => {
  const destinationDir = app.getPath('userData');
  const destinationPath = path.join(destinationDir, configFileName);

  try {
    fs.copyFileSync(sourceFilePath, destinationPath)
    console.log('File was copied to:', destinationPath);
    loadConfigJSON()
  } catch(error) {
    console.error('Error copying file:', error.message);
  }
  return
});

ipcMain.handle('get-version', async () => {
  return app.getVersion(); 
});

// --- Auto-Updater Event Listeners ---

// Update available: notify user and ask to download
autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available. Would you like to download it?`,
    buttons: ['Yes', 'No']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

// Update downloaded: prompt user to restart and install
autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `Version ${info.version} has been downloaded. The application will restart to apply the update.`,
    buttons: ['Restart Now']
  }).then(() => {
    autoUpdater.quitAndInstall(); // Restarts app and applies update
  });
});

// Handle errors gracefully
autoUpdater.on('error', (err) => {
  console.error('Error during auto-update:', err);
});