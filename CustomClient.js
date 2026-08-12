import { CustomQuery } from './CustomQuery.js'
import { DOMParser } from 'xmldom'
import * as xpath from 'xpath'



export class CustomClient {

    config = {}
    catalogLink = ""
    constructor(config) {
        this.config = config
    }

    async connect() {
        const response = await fetch(this.config.connectUrl)
        console.log("Connecting to custom catalog at " + this.config.connectUrl)
        return response.ok
    }

    getCatalogLink() {
        return this.catalogLink        
    }

    async query(queryString, startRecord = 1, maximumRecords = 50, getTotalCount = true) {
        var totalRecords = null        
        const customQuery = new CustomQuery(queryString,this.config)
        if(Object.hasOwn(this.config,'catalogLinkUrl')) {
            this.catalogLink = this.config.catalogLinkUrl
            if(customQuery.isCatalogLink) {
                this.catalogLink = this.catalogLink.replace(/[^\?]*$/,"") + 
                                    customQuery.queryString.replaceAll("\"","%22")
            } else {
                this.catalogLink += encodeURIComponent(customQuery.queryString)
            }
        } 
        const getValueByPath  = (obj, jsonPath)  => {
            return jsonPath.split('.').reduce((acc, part) => acc && acc[part], obj);
        }
        if(getTotalCount) {
            var countUrl = this.config.resultCountBaseUrl 
            if(customQuery.isCatalogLink) {
                countUrl = countUrl.replace(/[^\?]*$/,"") + customQuery.queryString
            } else {
                countUrl += encodeURIComponent(customQuery.queryString) 
            }
            countUrl += `&${this.config.pageParam}=1&${this.config.maxRecsParam}=1`            
            console.log(countUrl)
            
            const countResponse = await fetch(countUrl)
            const countText = await countResponse.text()
            if(this.config.resultCountField.startsWith("json:")) {
                const jsonPath = this.config.resultCountField.replace(/^json:/, '')                
                totalRecords = getValueByPath(JSON.parse(countText), jsonPath)   
            }

        }

        var pageno = Math.ceil(startRecord / maximumRecords)
        var queryUrl = this.config.recordsBaseUrl 
        if(customQuery.isCatalogLink) {
            queryUrl = queryUrl.replace(/[^\?]*$/,"") + customQuery.queryString
        } else {
            queryUrl += encodeURIComponent(customQuery.queryString)
        }
        queryUrl += `&${this.config.pageParam}=${pageno}&${this.config.maxRecsParam}=${maximumRecords}`
        
        console.log(queryUrl)
        
        const recordsResponse = await fetch(queryUrl)

        if(!recordsResponse || !recordsResponse.ok) {
            return {numberOfRecords: 0, records: []}
        }


        var recordsText = await recordsResponse.text()
        var recordsArray = []
        const parser = new DOMParser();

        if(this.config.recordsField) {
            const jsonPath = this.config.recordsField.replace(/^json:/, '') 
            recordsArray = getValueByPath(JSON.parse(recordsText),jsonPath)
            if(!Array.isArray(recordsArray)) {
                recordsArray = [recordsArray]
            }
            if(this.config.wrappers) {
                for(var i = 0; i < this.config.wrappers.length; i++) {
                    var wrapper = this.config.wrappers[i]
                    if(wrapper.startsWith("json:")) {
                        const wrapperPath = wrapper.replace(/^json:/, '')   
                        recordsArray = recordsArray.map((rec) => { return getValueByPath(rec, wrapperPath)})
                    }
                }
            }
            recordsText = recordsArray.join("\n")
        }
        if(recordsText == "") {
            return {numberOfRecords: 0, records: []}
        }
        if(this.config.resultFormat == 'json') {
            return {numberOfRecords: totalRecords, records: recordsArray}
        } else {
            const responseXML = parser.parseFromString(recordsText, "text/xml");
                
            var records = []
            if(this.config.namespaces) {
                const selectWithNs = xpath.useNamespaces(this.config.namespaces)        
                records = selectWithNs('//marc:record', responseXML)
            } else {
                records = xpath.select('//marc:record', responseXML)
            }
            records = records.map(record => record.toString().replaceAll(/<datafield ([^>]*) (tag=\"...\")/g,'<datafield $2 $1'))
        
            return {numberOfRecords: totalRecords, records: records}
        }
    }    
}