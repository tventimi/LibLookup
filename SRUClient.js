import { SRUQuery } from './SRUQuery.js'
import { DOMParser } from 'xmldom'
import * as xpath from 'xpath'

const sruNamespaces = {
  "srw": "http://www.loc.gov/zing/srw/",
  "marc": "http://www.loc.gov/MARC21/slim"
}

export class SRUClient {

    baseurl = ""
    constructor(baseurl) {
        this.baseurl = baseurl   
    }

    async connect() {
        const explainResponse = await fetch(this.baseurl + "?version=1.2&operation=explain")
        console.log("Connecting to SRU catalog at " + this.baseurl)
        const explainText = await explainResponse.text()
        return explainText.includes("explainResponse")
    }

    async query(queryString, startRecord = 1, maximumRecords = 50) {
        const sruQuery = new SRUQuery(queryString)
        console.log("SRU query: " + sruQuery.queryString)
        const queryResponse = await fetch(this.baseurl + "?version=1.2&operation=searchRetrieve&query=" + encodeURIComponent(sruQuery.queryString) + "&startRecord=" + startRecord + "&maximumRecords=" + maximumRecords)
        const responseText = await queryResponse.text()
        const parser = new DOMParser();

        const responseXML = parser.parseFromString(responseText, "text/xml");
        const selectWithNs = xpath.useNamespaces(sruNamespaces)
        
        const totalRecords = selectWithNs('//srw:numberOfRecords/text()', responseXML, true)?.nodeValue || 0;
        console.log("SRU query returned " + totalRecords + " records")
        var records = selectWithNs('//srw:searchRetrieveResponse/srw:records/srw:record/srw:recordData/marc:record', responseXML)
        records = records.map(record => record.toString().replaceAll(/<datafield ([^>]*) (tag=\"...\")/g,'<datafield $2 $1'))
        return {numberOfRecords: totalRecords, records: records}
    }
}