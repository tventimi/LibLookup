import { SRUQuery } from './SRUQuery.js'
import { DOMParser } from 'xmldom'
import * as xpath from 'xpath'

const SRU_QUERY_MAX = 10000

const sruNamespaces = {
  "srw": "http://www.loc.gov/zing/srw/",
  "marc": "http://www.loc.gov/MARC21/slim",
  "isohold":"http://www.loc.gov/standards/iso20775/"
}

export class SRUClient {

    config = ""
    constructor(config) {
        this.config = config
    }

    async connect() {
        const explainResponse = await fetch(this.config.baseurl + "?version=1.2&operation=explain")
        console.log("Connecting to SRU catalog at " + this.config.baseurl)
        const explainText = await explainResponse.text()
        return explainText.includes("explainResponse")
    }

    async query(queryString, startRecord = 1, maximumRecords = 50, includeHoldings = false) {
        const sruQuery = new SRUQuery(queryString)
        console.log("SRU query: " + sruQuery.queryString)
        const queryURL = this.config.baseurl + "?version=1.2&operation=searchRetrieve&query=" + 
            encodeURIComponent(sruQuery.queryString) + "&startRecord=" + startRecord + "&maximumRecords=" + maximumRecords
        console.log(queryURL)
        const queryResponse = await fetch(queryURL)
        const responseText = await queryResponse.text()
        const parser = new DOMParser();

        const responseXML = parser.parseFromString(responseText, "text/xml");
        const selectWithNs = xpath.useNamespaces(sruNamespaces)
        
        var totalRecords = selectWithNs('//srw:numberOfRecords/text()', responseXML, true)?.nodeValue || 0;
        totalRecords = Math.min(totalRecords,SRU_QUERY_MAX)
        console.log("SRU query returned " + totalRecords + " records")
        var records = selectWithNs('//srw:searchRetrieveResponse/srw:records/srw:record/srw:recordData/marc:record', responseXML)
        records = records.map(record => record.toString().replaceAll(/<datafield ([^>]*) (tag=\"...\")/g,'<datafield $2 $1'))
        records = records.map(record => record.replaceAll(/<subfield([^>]*)\/>/g, '<subfield$1></subfield>'))
        if(includeHoldings) {
            const holdingsURL = queryURL + "&recordSchema=isohold"
            console.log(holdingsURL)

            const holdingsResponse = await fetch(holdingsURL)
            const holdingsText = await holdingsResponse.text()
            const holdingsXML = parser.parseFromString(holdingsText, "text/xml");
            var holdingsRecords = selectWithNs('//srw:searchRetrieveResponse/srw:records/srw:record/srw:recordData', holdingsXML)
                 
            //if query contains a barcode, only include item records with that barcode
            if(sruQuery.barcode) {
                holdingsRecords.forEach(holding =>  {
                    var copies = []
                    var components = []
                    if(sruQuery.barcode == "[empty]") {
                        copies = selectWithNs(`.//isohold:copyInformation[boolean(isohold:pieceIdentifier/isohold:value)]`,holding)
                        components = selectWithNs(`.//isohold:component[boolean(isohold:pieceIdentifier/isohold:value)]`,holding)
                    } else {
                        copies = selectWithNs(`.//isohold:copyInformation[isohold:pieceIdentifier/isohold:value/text()!=${sruQuery.barcode}]`,holding)
                        components = selectWithNs(`.//isohold:component[isohold:pieceIdentifier/isohold:value/text()!=${sruQuery.barcode}]`,holding)
                    }
                    const nonMatchingItems = [...copies,...components]
                    nonMatchingItems.forEach(item => {
                        item.parentNode.removeChild(item)
                    })
                })
            }
            holdingsRecords = holdingsRecords.map(holdings => selectWithNs('.//isohold:holding',holdings).map(
                hold => hold.toString()
            ))

            return {numberOfRecords: totalRecords, records: records, holdings: holdingsRecords}
        } else {
            return {numberOfRecords: totalRecords, records: records}
        }
    }

    static extractIsoHoldFields(xml,fieldpath) {
        const parser = new DOMParser();
        if(xml == '') {
            return []
        }
        const holdingsXML = parser.parseFromString(xml, "text/xml");
        const selectWithNs = xpath.useNamespaces(sruNamespaces)
        const fields = selectWithNs(fieldpath + "/text()",holdingsXML)
        return fields.map(f => f.nodeValue)
    }
}