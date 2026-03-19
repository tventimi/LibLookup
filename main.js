import { app, BrowserWindow, ipcMain } from 'electron/main';
import { Z3950Client } from './Z3950Client.js';
import { webserver } from './webserver/webserver.js';
import { Marc } from 'marcjs'
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

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
    const server = new webserver(resultsList)
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
        createWindow()
        //z3950client.query(i, queries.shift())
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
          var rec_formatted = "=LDR  " + marc.leader + "<br/>"
          marc.fields.forEach(f => {
            rec_formatted += "="
            f.forEach(sf => {
              if(sf.length == 1) {
                rec_formatted += "$" 
              }   
              rec_formatted += sf + " "
            })
            rec_formatted += "<br/>"
          })          
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