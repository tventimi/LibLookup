import { app, BrowserWindow, ipcMain } from 'electron/main'
import { Z3950Client } from './Z3950Client.js';
import { Marc } from 'marcjs'
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'path';
import * as https from 'https'
import { fileURLToPath } from 'node:url';
import { shell } from 'electron'
import { Subject }  from 'rxjs'

const catalogs = {
  "WorldCat": {
    host: 'zcat.oclc.org',
    database: 'OLUCWorldCat',
    username: '100062493',
    password: 'catalog',
    port: 210
  },
  "OCLCAuthorities": {
    host: 'zcat.oclc.org',
    database: 'OCLCAuthoritiesLC',
    username: '100062493',
    password: 'catalog',
    port: 210
  },
  "AlmaProd": {
    host: 'princeton.alma.exlibrisgroup.com',
    database: '01PRI_INST',
    port: 1921
  },
  "AlmaSand": {
    host: 'princeton-psb.alma.exlibrisgroup.com',
    database: '01PRI_INST',
    port: 1921
  },
  "LCCAT": {
    host: 'lx2.loc.gov',
    database: 'LCDB',
    port: 210 
  },
  "LCNAF": {
    host: 'lx2.loc.gov',
    database: 'NAF',
    port: 210 
  },
  "LCSAF": {
    host: 'lx2.loc.gov',
    database: 'SAF',
    port: 210 
  }
}

const inputFile = 'input/testdata.txt'
const outputFile = 'output/output.mrc'

var queries = []
var results = new Subject()
var resultSetID = ""
var catalogID = "WorldCat"
var win
var z3950client

const createWindow = () => {  
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })


  win.loadFile('index.html').then(() => {
    const headers = {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000 // 30 days
    }; 
    
    const serverOptions = {
      key: fs.readFileSync('./webserver/server.key'),
      cert: fs.readFileSync('./webserver/server.crt')
    };
    
    const server = https.createServer(serverOptions, (req, res) => {    
      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
      } else {
        var url = new URL(req.url, `https://${req.headers.host}`)
        var filename = url.pathname.replace(/^\/+/, '') || 'index.html'
        fs.readFile(filename, (err, data) => {  
          if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
          } else {  
            res.writeHead(200, headers);
            var output = data.toString()
            if(filename === 'index.html') {
                output = output.replace('renderer.js', 'webrenderer.js')
            }
            var catalog = url.searchParams.get('catalog')
            var query = url.searchParams.get('q')
            if(catalog && query) {
              resultSetID = "WEB1"
              results.subscribe(rec => {
                output += rec
                res.end(output)
              })
              if(catalog != catalogID) {
                catalogID = catalog
                z3950Connect(catalogID)
              }
              z3950search(resultSetID, query)
            } else {
              res.end(output)
            }
          }          
        })   
      }             
    })
    server.listen(3950, 'localhost', () => {
      console.log('Electron app listening for HTTPS calls on https://localhost:3950');
    });
  })  
}

app.whenReady().then(() => {
  results.subscribe(rec => {
    if(resultSetID.startsWith("APP")) {
      win.webContents.send('set-results',rec)
    }
  })
  z3950Connect(catalogID)
})

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
  z3950client.connect((respType, respBody) => {
    //console.log(respType)
    switch(respType) {
      case 'initResponse':
        if(!win) {
          createWindow()
        }        
        break;
      case 'error':
        console.log(respBody)
        if(respBody == 'timeout') {
          z3950client.reconnect()
        }
        break;
      case 'searchResponse':
        console.log(`${respBody} results found`)
        z3950client.getRecord(resultSetID, 1)
        break;
      case 'presentResponse':
        var rec = ""
        if(respBody == "") {
          rec = "No record found."
        } else {
          const recBinary = Buffer.from(respBody,'binary')
          const marc = Marc.parse(recBinary, 'Iso2709');
          rec = "<table class='marc'><tr><td>LDR</td><td></td><td></td><td>" + marc.leader + "</td></tr>"
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
        }        
        results.next(rec)   
        break;
      }
  })
}

function z3950search(resultSetID, query) {
  if(!z3950client.isConnected()) {
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

ipcMain.on('connect-channel', (event, catalog) => {
  console.log('Received catalog from renderer:', catalog);
  win.webContents.send('set-results',"")
  catalogID = catalog
  z3950Connect(catalogID)
})

ipcMain.on('form-submission-channel', (event, data) => {
    var i = 1
    queries = [data.queryString]
    resultSetID = "APP1"
    z3950search(resultSetID, data.queryString)
});
