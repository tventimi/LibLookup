import { app, BrowserWindow, ipcMain } from 'electron/main';
import { Z3950Client } from './Z3950Client.js';
import { webserver } from './webserver/webserver.js';
import { Marc } from 'marcjs'
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { shell } from 'electron'

const port = 210
const host = 'zcat.oclc.org'
const database = 'OLUCWorldCat'
const username = '100062493'
const password = 'catalog'

const inputFile = 'input/testdata.txt'
const outputFile = 'output/output.mrc'

var queries = []
var win
var z3950client

const createWindow = (resultsList) => {  
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
    const server = new webserver("index.html")
    //win.webContents.send('set-results',resultsList)
  })  
}

app.whenReady().then(() => {
  /*
  var resultsList = ""
  
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
          crlfDelay: Infinity
        });

  rl.on('line', (line) => {
    queries.push(line)
  });
  const writeStream = fs.createWriteStream(outputFile);  
  */
  var i = 1
  z3950client = new Z3950Client(port, host, database, username, password)
  z3950client.connect((respType, respBody) => {
    //console.log(respType)
    switch(respType) {
      case 'initResponse':
        if(!win) {
          createWindow()
        }        
        //shell.openExternal('https://localhost:3950')
        //z3950client.query(i, queries.shift())
        break;
      case 'error':
        console.log(respBody)
        if(respBody == 'timeout') {
          z3950client.disconnect()
          z3950client.initiateConnection()
        }
        break;
      case 'searchResponse':
        console.log(`${respBody} results found`)
        z3950client.getRecord(i, 1)
        break;
      case 'presentResponse':
        var rec = ""
        if(respBody == "") {
          rec = "No record found."
        } else {
          const rec = Buffer.from(respBody,'binary')
          const marc = Marc.parse(rec, 'Iso2709');
          //writeStream.write(respBody)
          var rec_formatted = "<table class='marc'><tr><td>LDR</td><td></td><td></td><td>" + marc.leader + "</td></tr>"
          marc.fields.forEach(f => {
            var tag = f[0]
            rec_formatted += "<tr><td>" + tag + "</td><td>" 
            var ind1 = ""
            var ind2 = ""
            var startIndex = 1
            if(!tag.match(/^00/)) {
              ind1 = f[1][0]
              ind2 = f[1][1]
              startIndex = 2
            }
            rec_formatted += ind1 + "</td><td>" + ind2 + "</td><td>"
            for(var i = startIndex; i < f.length; i++) { 
              var sf = f[i]
              if(sf.length == 1) {
                rec_formatted += "$" 
              }   
              rec_formatted += sf + " "
            }
            rec_formatted += "</td></tr>"
          })           
          rec_formatted += "</table>"          
        }
        //resultsList += `${rec}`
        //if(queries.length > 0) {
        //  i++
        //  z3950client.query(i, queries.shift())
        //} else {
          //z3950client.disconnect()
          win.webContents.send('set-results',rec_formatted)
        //}
        break;
      }
  })
})

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

ipcMain.on('form-submission-channel', (event, data) => {
    var i = 1
    queries = [data.queryString]
    var resultsList = ""    
    z3950client.query(i, data.queryString)
});
