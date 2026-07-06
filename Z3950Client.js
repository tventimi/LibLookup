import net from 'net';
import asn1js, { Null } from 'asn1js';
import { create } from 'domain';
import { Z3950Query } from './Z3950Query.js';

const MESSAGE_SIZE = 0x4000000
const BIB1_OBJID = '1.2.840.10003.3.1'
const USMARC_OBJID = '1.2.840.10003.5.10'
const UTF8_OBJID = '1.2.840.10003.15.3'
const UCS_OBJID = [0x28, 0xD3, 0x16, 0x01, 0x00, 0x08]
const timeout = 600000 //10 minutes

export class Z3950Client {
    port = 0
    host = ''
    database = ''
    dataBuffer = null
    client = null
    resultsets = []

    constructor(port, host, database, username, password) {
        this.port = port
        this.host = host
        this.database = database
        this.username = username
        this.password = password
        this.dataBuffer = Buffer.alloc(0)
    }

    initiateConnection() {
        this.client = net.createConnection({ 
                port: this.port, 
                host: this.host,
            })
    }

    isConnected() {
        return (this.client?.readyState === 'open')
    }

    connect(callback) {
        this.initiateConnection()
        this.client.on('connect', () => {
            console.log('Connected to ' + this.client.remoteAddress + ':' + this.client.remotePort)
            this.client.setTimeout(timeout)
            var initRequest = createInitRequest(this.username, this.password)
            this.client.write(new Uint8Array(initRequest.toBER()))
        })
        this.client.on('data', (data) => {
            this.dataBuffer = Buffer.concat([this.dataBuffer, Buffer.from(data)])
            var response = new asn1js.fromBER(this.dataBuffer)
            if(response.offset == -1) {
                callback('waitForData','')
                return
            } else {
                this.dataBuffer = Buffer.alloc(0)
            }
            if(response.result) {
                var respCode = response.result.idBlock.tagNumber
                var respValue = ""
                var respType = respCode
                console.log(respCode)
                switch(respCode) {
                    case 21:
                        respType = 'initResponse'  
                        console.log(`Connected to ${this.host} on port ${this.port}`);
                        break;
                    case 23:
                        respType = 'searchResponse'
                        var respBody = response.result.valueBlock.value
                        for(var i = 0; i < respBody.length; i++) {
                            if(respBody[i].idBlock.tagNumber == 23) {
                                var numResults = 0
                                var numResultsArray = respBody[i].valueBlock.valueHexView
                                for(var j = 0; j < numResultsArray.length; j++) {
                                    numResults = numResults*256 
                                    numResults += numResultsArray[j]
                                }
                                respValue = numResults
                            }
                        }
                        break;
                    case 25:
                        respType = "presentResponse"
                        var respBody = response.result.valueBlock.value
                        for(var i = 0; i < respBody.length; i++) {
                            if(respBody[i].idBlock.tagNumber == 24) {
                                console.log(respBody[i].valueBlock.valueHexView[0] + " record(s) returned")
                            }
                            else if(respBody[i].idBlock.tagNumber == 28) {
                                respValue = ""
                                var allRecords = respBody[i].valueBlock.value
                                for(var j = 0; j < allRecords.length; j++) {
                                    var rec = allRecords[j].valueBlock.value[1].valueBlock.value[0].valueBlock.value[0].valueBlock.value[1]
                                    respValue += String.fromCodePoint(...rec.valueBlock.valueHexView)
                                }
                            }
                        }
                        break;
                    default:
                        break;
                }     
                callback(respType,respValue)   
            }                 
        });
        this.client.on('timeout', () => {
            console.log('Socket idle timeout reached. Closing connection.');
            this.client.setTimeout(0)
            this.client.end(); 
        });
        this.client.on('close', () => {
            console.log('Connection closed');
        });        
        this.client.on('error', (err) => {
            console.error('Socket error:', err);
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                callback('error','timeout')
            } else {
                console.error('Other error:', err.message);
                callback('error',err.message)
            }
        });
    }

    reconnect(callback) {
        console.log('Reconnecting...')
        this.connect(callback)
    }

    disconnect() {
        console.log(`Closing connection`);
        var closeRequest = createCloseRequest()
        this.client.write(new Uint8Array(closeRequest.toBER()))
    }

    query(resultsetid, queryString) {        
        console.log(`Sending query '${queryString}' (result set ${resultsetid})`)
        var searchRequest = createSearchRequest(this.database, resultsetid, queryString)
        this.resultsetid++
        this.client.write(new Uint8Array(searchRequest.toBER()))
    }

    getRecords(resultsetid, recno = 1, count = 1) {
        console.log(`Retrieving ${count} record(s) starting from ${recno}`)
        var presentRequest = createPresentRequest(resultsetid, recno, count)
        this.client.write(new Uint8Array(presentRequest.toBER()))
    }
}

function createIdBlock(tagNumber) {
    return {tagClass: 3, tagNumber: tagNumber}
}
    
function createInitRequest(username, password) {
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
    

    return createASN1object({id: 20, value: msgElements})
}

function createCloseRequest() {
    var req = createASN1object({id: 48, value: [{id: 211, value: 0}]})
    return req    
}

function zQueryToASN1(zQuery) {
    var encoder = new TextEncoder()
    var asn1 = null
    if(zQuery.type == "operand") {
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
                    zQueryToASN1(zQuery.leftOperand), //left operand
                    zQueryToASN1(zQuery.rightOperand), //right operand
                    {id: 46, value: [{id: zQuery.operator, value: null}]} //operator type
                ]}
    }   
    return asn1
}

function createSearchRequest(database, rsid, queryString) {
    var encoder = new TextEncoder()
    var bib1object = new asn1js.ObjectIdentifier({value: BIB1_OBJID})


    if(!queryString.includes('@')) {
        if(!(queryString.startsWith('"') && queryString.endsWith('"'))) {
            queryString = "\"" + queryString + "\""
        }
    }
    var zQuery = new Z3950Query(queryString)   

    var req = createASN1object({id: 22, value: [
        {id: 13, value: 0}, //Small set lower bound
        {id: 14, value: 1}, //Large set upper bound
        {id: 15, value: 0}, //Medium set present number
        {id: 16, value: 1}, //Replace indicator
        {id: 17, value: encoder.encode(rsid)}, //Result set ID
        {id: 18, value: [ //Database name(s)
            {id: 105, value: encoder.encode(database)}
        ]},
        {id: 21, value: [ //Query
            {id: 1, value: [ //RPN Query
                {value: bib1object},
                zQueryToASN1(zQuery)
            ]}
        ]}
    ]})
    return req
}

function createPresentRequest(rsid, recno = 1, count = 1) {
    var encoder = new TextEncoder()
    var marcObj = new asn1js.ObjectIdentifier({value: USMARC_OBJID})
    var req = createASN1object({id: 24, value: [
        {id: 31, value: encoder.encode(rsid)}, //result set ID
        {id: 30, value: recno}, //starting record number
        {id: 29, value: count},  //number of records to return
        {id: 104, value: marcObj.valueBlock.toBER()} //USMARC format
    ]})
    return req
    
}

function createASN1object(jsonOBJ) {
    var idBlock = createIdBlock(jsonOBJ?.id)
    var valueType = typeof(jsonOBJ.value)
    if(Array.isArray(jsonOBJ.value)) {
        var valueArray = Object.values(jsonOBJ.value)
        var asn1values = []
        for(var i = 0; i < valueArray.length; i++) {
            asn1values.push(createASN1object(valueArray[i]))
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
            for(var i = 0; i < byteLength; i++) {
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


