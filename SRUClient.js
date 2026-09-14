import { SRUQuery } from './SRUQuery.js'
import { DOMParser } from 'xmldom'
import * as xpath from 'xpath'

const SRU_QUERY_MAX = 10000
const SRU_PAGE_SIZE = 50
const MMS_ID_MAX = 999999999999
const ACCELERATE_FACTOR = 5

const sruNamespaces = {
  "srw": "http://www.loc.gov/zing/srw/",
  "marc": "http://www.loc.gov/MARC21/slim",
  "isohold":"http://www.loc.gov/standards/iso20775/"
}

export class SRUClient {

    config = ""
    segments = []
    latestQuery = ""
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
        if(this.latestQuery != queryString) {
            this.segments = []
            this.latestQuery = queryString
        }
        const sruQuery = new SRUQuery(queryString)
        console.log("SRU query: " + sruQuery.queryString)

        //query will fail if first record is above SRU_QUERY_MAX, so we need to start at 1 and then calculate segments
        const testStart = (startRecord > SRU_QUERY_MAX) ? 1 : startRecord
        const queryURL = this.buildSegmentURL(sruQuery.queryString, null, null, testStart, maximumRecords)
        console.log(queryURL)
        const queryResponse = await fetch(queryURL)
        const responseText = await queryResponse.text()
        const parser = new DOMParser();

        const responseXML = parser.parseFromString(responseText, "text/xml");
        const selectWithNs = xpath.useNamespaces(sruNamespaces)
        
        var totalRecords = selectWithNs('//srw:numberOfRecords/text()', responseXML, true)?.nodeValue || 0;
        console.log("SRU query returned " + totalRecords + " records")
        if(totalRecords > SRU_QUERY_MAX) {
            await this.calculateSegments(sruQuery.queryString,totalRecords,Math.min(startRecord+maximumRecords-1,totalRecords))
            console.log(this.segments)
        }

        var urls = []
        if(this.segments.length == 0) {
            urls.push(queryURL)
        } else {
            var runningTotal = 0
            for(var i = 0; i < this.segments.length; i++) {
                const segment = this.segments[i]
                const resultCount = parseInt(segment.resultCount)

                if(startRecord > runningTotal + resultCount || 
                    (startRecord + maximumRecords) < runningTotal) {
                    runningTotal += resultCount
                    continue
                } 
                const segmentStart = Math.max(startRecord - runningTotal,1)
                const segmentMax = Math.min(maximumRecords, startRecord - runningTotal + maximumRecords - 1)
                const segmentURL = this.buildSegmentURL(sruQuery.queryString, segment.startMMS, segment.endMMS, segmentStart, segmentMax)
                urls.push(segmentURL)
                runningTotal += resultCount
            }
        }
        var allRecords = []
        var allHoldings = []
        for(var i = 0; i < urls.length; i++) {
            const thisSegmentURL = urls[i]
            console.log(thisSegmentURL)
            const segmentResponse = await fetch(thisSegmentURL)
            const segmentText = await segmentResponse.text()
            const segmentXML = parser.parseFromString(segmentText, "text/xml");
            var records = selectWithNs('//srw:searchRetrieveResponse/srw:records/srw:record/srw:recordData/marc:record', segmentXML)
            records = records.map(record => record.toString().replaceAll(/<datafield ([^>]*) (tag=\"...\")/g,'<datafield $2 $1'))
            records = records.map(record => record.replaceAll(/<subfield([^>]*)\/>/g, '<subfield$1></subfield>'))
            allRecords.push(...records)
        
            if(includeHoldings) {
                const holdingsURL = thisSegmentURL + "&recordSchema=isohold"
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
                allHoldings.push(...holdingsRecords)
            }
        }
        if(includeHoldings) {
            return {numberOfRecords: totalRecords, records: allRecords, holdings: allHoldings}
        } else {
            return {numberOfRecords: totalRecords, records: allRecords}
        }
    }

    async calculateSegments(queryString,resultCount,calculateUpTo,startMMS = 0, endMMS = MMS_ID_MAX, accelerate = false) {
        var runningTotal = 0
        console.log(`${resultCount}|${calculateUpTo}|${startMMS}|${endMMS}|${accelerate}`)
        console.log(this.segments)
        for(var i = 0; i < this.segments.length; i++) {
            runningTotal += parseInt(this.segments[i].resultCount)
            startMMS = Math.max(startMMS,this.segments[i].endMMS+1)
        }
        if(runningTotal >= calculateUpTo) {
            return
        }

        var segmentCountGuess = Math.ceil(resultCount / SRU_QUERY_MAX)
        segmentCountGuess = (accelerate) ? ACCELERATE_FACTOR : segmentCountGuess
        const firstMax = startMMS + Math.ceil((endMMS - startMMS) / segmentCountGuess)
        const queryURL = this.buildSegmentURL(queryString, startMMS, firstMax, 1, 0)
        console.log(queryURL)
        const queryResponse = await fetch(queryURL)
        const responseText = await queryResponse.text()
        const parser = new DOMParser();
        const responseXML = parser.parseFromString(responseText, "text/xml");
        const selectWithNs = xpath.useNamespaces(sruNamespaces)
        var newResultCount = selectWithNs('//srw:numberOfRecords/text()', responseXML, true)?.nodeValue || 0;
        console.log(newResultCount)
        
        if(newResultCount > SRU_QUERY_MAX) {
            await this.calculateSegments(queryString,newResultCount,calculateUpTo,startMMS,firstMax,(newResultCount == resultCount))
        } else {
            if(newResultCount > 0) {
                this.segments.push({startMMS: startMMS, endMMS: firstMax-1, resultCount: newResultCount})
            }
            await this.calculateSegments(queryString,resultCount-newResultCount,calculateUpTo,firstMax,MMS_ID_MAX,(newResultCount < (SRU_QUERY_MAX / 100)))
        }
    }

    buildSegmentURL(queryString, startMMS, endMMS, startRecord, maximumRecords) {
        return this.config.baseurl + "?version=1.2&operation=searchRetrieve&query=(+" + 
            encodeURIComponent(queryString) + "+)" + 
            ((startMMS != null) ? `+AND+alma.mms_id+>=+99${startMMS}0000` : "") + 
            ((endMMS != null) ? `+AND+alma.mms_id+<+99${endMMS}0000` : "") + 
            `&startRecord=${startRecord}&maximumRecords=${maximumRecords}`
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