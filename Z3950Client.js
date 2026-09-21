import net from 'net';
import asn1js from 'asn1js';
import { Z3950Query } from './Z3950Query.js';

const MESSAGE_SIZE = 0x4000000
const BIB1_OBJID = '1.2.840.10003.3.1'
const USMARC_OBJID = '1.2.840.10003.5.10'
const UTF8_OBJID = '1.2.840.10003.15.3'
const UCS_OBJID = [0x28, 0xD3, 0x16, 0x01, 0x00, 0x08]
const timeout = 120000 //2 minutes
const intervalLength = 100

export class Z3950Client {
    port = 0
    host = ''
    database = ''
    dataBuffer = null
    client = null
    resultsets = []
    inSession = false
    latestQuery = ""
    latestResultCount = 0
    latestResponse = null
    latestError = ""
    resultSetId = 0
    awaitingResponse = false
    config = null
    elementSet = "F"

    constructor(config) {
        this.config = config
        this.dataBuffer = Buffer.alloc(0)
    }

    initiateConnection() {
        console.log(`Connecting to ${this.config.host} on port ${this.config.port}...`)
        this.client = net.createConnection({ 
                port: this.config.port, 
                host: this.config.host,
            })
    }

    isConnected() {
        return this.inSession && this.client?.readyState === 'open'
    }

    connect(reconnect = false) {
        this.latestError = ""
        if(!reconnect && this.isConnected()) {
            return true
        }

        if(this.isConnected()) {
            this.disconnect()
        }
        this.initiateConnection()
        this.latestQuery = ""
        
        this.client.on('connect', () => {
            console.log('Connected to ' + this.client.remoteAddress + ':' + this.client.remotePort)
            this.client.setTimeout(timeout)
            var initRequest = this.createInitRequest(this.config.username, this.config.password)
            this.sendToClient(initRequest)
        })
        
        this.client.on('data', (data) => {
            this.dataBuffer = Buffer.concat([this.dataBuffer, Buffer.from(data)])
            var response = new asn1js.fromBER(this.dataBuffer)
            if(response.offset == -1) { //message not complete, awaiting more data
                return
            } 
            //otherwise, new message
            this.dataBuffer = Buffer.alloc(0)
            if(response.result) {
                var respCode = response.result.idBlock.tagNumber
                var respValue = ""
                var respBody
                console.log(respCode)
                switch(respCode) {
                    case 21: //initResponse  
                        console.log(`Connected to ${this.config.host} on port ${this.config.port}`);
                        this.inSession = true
                        break;
                    case 23: //searchResponse
                        respBody = response.result.valueBlock.value
                        for(var i = 0; i < respBody.length; i++) {
                            if(respBody[i].idBlock.tagNumber == 23) {
                                var numResults = 0
                                var numResultsArray = respBody[i].valueBlock.valueHexView
                                for(var j = 0; j < numResultsArray.length; j++) {
                                    numResults = numResults*256 
                                    numResults += numResultsArray[j]
                                }
                                this.latestResultCount = numResults
                            }
                        }
                        console.log(`Search returned ${this.latestResultCount} record(s)`)
                        break;
                    case 25: //presentResponse
                        respBody = response.result.valueBlock.value
                        for(i = 0; i < respBody.length; i++) {
                            if(respBody[i].idBlock.tagNumber == 24) {
                                console.log(respBody[i].valueBlock.valueHexView[0] + " record(s) returned")
                            }
                            else if(respBody[i].idBlock.tagNumber == 28) {
                                respValue = ""
                                var allRecords = respBody[i].valueBlock.value
                                for(j = 0; j < allRecords.length; j++) {
                                    var rec = allRecords[j].valueBlock.value[1].valueBlock.value[0].valueBlock.value[0].valueBlock.value[1]
                                    respValue += String.fromCodePoint(...rec.valueBlock.valueHexView)
                                }
                            }
                            else if(respBody[i].idBlock.tagNumber == 130) {
                                if(respBody[i].valueBlock.value[2].valueBlock.value.includes("out of bounds for byte")) {
                                    this.latestError = "wcholdingslimit"
                                }
                            }
                        }
                        this.latestResponse = respValue                        
                        break;
                    default:
                        break;
                }  
                this.awaitingResponse = false  
            }                 
        });
        this.client.on('timeout', () => {
            console.log('Socket idle timeout reached. Closing connection.');
            this.inSession = false
            this.latestError = "timeout"
            this.client.setTimeout(0)
        });
        this.client.on('close', () => {
            console.log('Connection closed');
            this.inSession = false
        });        
        this.client.on('error', (err) => {
            this.inSession = false
            console.error('Socket error:', err);
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                this.latestError = "timeout"
            } else {
                console.error('Other error:', err.message);
                this.latestError = err.message
            }
            this.client.destroy()
        });

        //wait for response from initRequest, return connection status
        var interval = setInterval(() => {
            if(!this.awaitingResponse) {
                clearInterval(interval)
                return this.isConnected()
            }
        },intervalLength)
        
    }

    reconnect() {
        console.log('Reconnecting...')
        this.connect(true)
    }

    disconnect() {
        this.inSession = false
        console.log(`Closing connection`);
        var closeRequest = this.createCloseRequest()
        this.sendToClient(closeRequest,false)
    }

    sendToClient(request, awaitResponse = true) {
        this.awaitingResponse = awaitResponse
        this.client.write(new Uint8Array(request.toBER()))
    }

    query(queryString, startRecord = 1, maximumRecords = 50) {   
        console.log(`Sending query '${queryString}'`)
        this.latestError = ""
        return new Promise((resolve) => {            
            if(this.isConnected()) {
                this.searchAndPresent(queryString,startRecord,maximumRecords,this.config).then(recs => {
                    resolve({numberOfRecords: this.latestResultCount, records: recs})        
                })
            } else {
                this.connect(true)
                var interval = setInterval(() => {
                    if(this.isConnected()) {
                        this.searchAndPresent(queryString,startRecord,maximumRecords,this.config).then(recs => {
                            resolve({numberOfRecords: this.latestResultCount, records: recs})        
                        })  
                        clearInterval(interval)                
                    }
                },intervalLength)
            } 
        })
    }

    calculateResultSetSize(startRecord,maximumRecords) {
        if(startRecord + maximumRecords - 1 <= this.latestResultCount) {
            return maximumRecords
        } else {
            return (this.latestResultCount % maximumRecords)
        }
    }

    searchAndPresent(queryString,startRecord = 1,maximumRecords = 50) {
        return new Promise((resolve) => {            
            if(this.latestQuery == queryString && this.isConnected()) {
                var expectedResultCount = this.calculateResultSetSize(startRecord,maximumRecords)
                this.getRecords(startRecord,expectedResultCount).then(recs => {
                    resolve(recs)
                })
            } else {
                console.log('search')
                this.resultSetId++
                var searchRequest = this.createSearchRequest(this.config.database,this.resultSetId,queryString)
                this.sendToClient(searchRequest)
                var interval = setInterval(() => {
                    if(!this.awaitingResponse) {
                        clearInterval(interval)
                        var expectedResultCount = this.calculateResultSetSize(startRecord,maximumRecords)
                        this.getRecords(startRecord,expectedResultCount).then(recs => {
                            resolve(recs)
                        })
                    }
                },intervalLength)
            }
            this.latestQuery = queryString
        })
    }

    getRecords(recno = 1, count= 1) {
        return new Promise((resolve) => {
            var allRecords = []
            var startRecord = recno
            var expectedResultCount = count
            var readyForNext = true
            var done = false
            var interval = setInterval(() => {
                if(done) {
                    clearInterval(interval)
                    resolve(allRecords)
                    return
                }
                if(!this.awaitingResponse && readyForNext) {
                    console.log(`Retrieving ${expectedResultCount} record(s) starting from ${startRecord}`)
                    var presentRequest = this.createPresentRequest(this.resultSetId, startRecord, expectedResultCount)
                    this.sendToClient(presentRequest)
                    readyForNext = false
                }
                else if(!this.awaitingResponse) {    
                    if(this.latestResponse == "" || this.latestError != "") {
                        done = true
                    } else {
                        var marcRecords = this.latestResponse.split("\x1D")
                        if(marcRecords[marcRecords.length-1] == "") {
                            marcRecords.pop()       
                        } 
                        allRecords.push(...marcRecords)

                        if(allRecords.length < count) {      
                            startRecord += marcRecords.length
                            expectedResultCount -= marcRecords.length
                        } else {
                            done = true
                        }
                        readyForNext = true
                    }
                }     
            },intervalLength)            
        })
    }

    createIdBlock(tagNumber) {
        return {tagClass: 3, tagNumber: tagNumber}
    }
    
    createInitRequest(username, password) {
        var encoder = new TextEncoder()
        var utf8obj = new asn1js.ObjectIdentifier({value: UTF8_OBJID})
        var ucsobj = new Uint8Array(UCS_OBJID)
        var msgElements = []
        msgElements.push({id: 3, value: 0xE0, byteLength: 2, unusedBits: 5}) //Z39.50 version
        msgElements.push({id: 4, value: 0xE9A2, byteLength: 3}) //Options)
        msgElements.push({id: 5, value: MESSAGE_SIZE}) //Preferred message size
        msgElements.push({id: 6, value: MESSAGE_SIZE}) //Exceptional message size
        if(username && password) {
            var auth = new asn1js.VisibleString({valueHex: encoder.encode(`${username}/${password}`)})
            msgElements.push({id: 7, value: [{value: auth}]}) //authorization
        }
    
        msgElements.push({id: 201, value: [{value: [ //other information sequence
            {id: 4, value: [ //external definition
                {value: utf8obj}, //UTF8
                {id: 0, value: [
                    {id: 1, value: [
                        {id: 1, value: [
                            {id: 2, value: [
                                {id: 2, value: ucsobj} //UCS
                            ]}
                        ]},
                        {id: 3, value: 1}
                    ]}                
                ]}
            ]}
        ]}]})
        return this.createASN1object({id: 20, value: msgElements})
    }

    createCloseRequest() {
        var req = this.createASN1object({id: 48, value: [{id: 211, value: 0}]})
        return req    
    }

    zQueryToASN1(zQuery) {
        var encoder = new TextEncoder()
        var asn1
        if(zQuery.type == "operand" || zQuery.type == "empty") {
            asn1 = {id: 0, value: [ //operand
                    {id: 102, value: [ //attributes plus term
                        {id: 44, value: zQuery.attributes.map((attr) => (
                            {value: [ // attribute sequence
                                {id: 120, value: attr.type}, //attribute type 
                                {id: 121, value: attr.value} //attribute value 
                            ]}
                        ))},
                        {id: 45, value: encoder.encode(zQuery.term)} // search term
                    ]}
                ]}
        } else { //zQuery.type == "operator"
            asn1 = {id: 1, value: [ //operator                    
                    this.zQueryToASN1(zQuery.leftOperand), //left operand
                    this.zQueryToASN1(zQuery.rightOperand), //right operand
                    {id: 46, value: [{id: zQuery.operator, value: null}]} //operator type
                ]}
        }   
        return asn1
    }

    createSearchRequest(database,resultSetId,queryString) {
        var encoder = new TextEncoder()
        var bib1object = new asn1js.ObjectIdentifier({value: BIB1_OBJID})

        var zQuery = new Z3950Query(queryString, this.config)   
    
        console.log(JSON.stringify(zQuery,null,2))

        var req = this.createASN1object({id: 22, value: [
            {id: 13, value: 0}, //Small set lower bound
            {id: 14, value: 1}, //Large set upper bound
            {id: 15, value: 0}, //Medium set present number
            {id: 16, value: 1}, //Replace indicator
            {id: 17, value: encoder.encode(resultSetId)}, //Result set ID
            {id: 18, value: [ //Database name(s)
                {id: 105, value: encoder.encode(database)}
            ]},
            {id: 21, value: [ //Query
                {id: 1, value: [ //RPN Query
                    {value: bib1object},
                    this.zQueryToASN1(zQuery)
                ]}
            ]}
        ]})
        return req
    }

    createPresentRequest(resultSetId, recno = 1, count = 1) {
        var encoder = new TextEncoder()
        var marcObj = new asn1js.ObjectIdentifier({value: USMARC_OBJID})
        var req = this.createASN1object({id: 24, value: [
            {id: 31, value: encoder.encode(resultSetId)}, //result set ID
            {id: 30, value: recno}, //starting record number
            {id: 29, value: count},  //number of records to return
            {id: 19, value: [{id: 0, value: encoder.encode(this.elementSet)}]},
            {id: 104, value: marcObj.valueBlock.toBER()} //USMARC format
        ]})
        return req
    }

    createASN1object(jsonOBJ) {
        var idBlock = this.createIdBlock(jsonOBJ?.id)
        var valueType = typeof(jsonOBJ.value)
        if(Array.isArray(jsonOBJ.value)) {
            var valueArray = Object.values(jsonOBJ.value)
            var asn1values = []
            for(var i = 0; i < valueArray.length; i++) {
                asn1values.push(this.createASN1object(valueArray[i]))
            }
            if(idBlock.tagNumber === undefined) {
                return new asn1js.Sequence({value: asn1values})
            } else {
                return new asn1js.Constructed({idBlock: idBlock, value: asn1values})
            }
        } else {
            var newValue = jsonOBJ.value
            var unusedBits = 0
            if(jsonOBJ.unusedBits !== undefined) {
                unusedBits = jsonOBJ.unusedBits
            }

           if(newValue == null) {
                newValue = new Uint8Array()
            } else if(valueType == 'number') {          
                var byteLength = Math.ceil(Math.log2(newValue + 1) / 7);
                if(jsonOBJ.byteLength !== undefined) {
                    byteLength = jsonOBJ.byteLength
                }
                byteLength = (byteLength > 0) ? byteLength : 1;
            
                var byteArray = []            
                for(i = 0; i < byteLength; i++) {
                    byteArray.unshift((newValue >> (i*8)) & 0xFF)
                }
                newValue = new Uint8Array(byteArray)     
            }
            if(idBlock.tagNumber === undefined) {
                return newValue
            } else {
                return new asn1js.Primitive({idBlock: idBlock, valueHex: newValue, unusedBits: unusedBits})
            }
        } 
    }
}


