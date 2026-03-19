import net from 'net';
import asn1js from 'asn1js';

const MESSAGE_SIZE = 0x4000000
const BIB1_OBJID = '1.2.840.10003.3.1'
const USMARC_OBJID = '1.2.840.10003.5.10'
const UTF8_OBJID = '1.2.840.10003.15.3'
const UCS_OBJID = '1.0.10646.1.0.8'

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

    connect(callback) {
        this.client = net.createConnection({ 
                port: this.port, 
                host: this.host
            }, 
            () => {
                console.log(`Connected to ${this.host} on port ${this.port}`);
                var initRequest = createInitRequest(this.username, this.password)
                this.client.write(new Uint8Array(initRequest.toBER()))
            }
        )
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
                switch(respCode) {
                    case 21:
                        respType = 'initResponse'                    
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
                            if(respBody[i].idBlock.tagNumber == 28) {
                                var rec = respBody[i].valueBlock.value[0].valueBlock.value[1].valueBlock.value[0].valueBlock.value[0].valueBlock.value[1]
                                respValue = String.fromCodePoint(...rec.valueBlock.valueHexView)
                            }
                        }
                        break;
                    default:
                        break;
                }             
                callback(respType,respValue)   
            }                 
        });
        this.client.on('close', () => {
            console.log('Connection closed');
        });
        this.client.on('error', (err) => {
            console.error('Socket error:', err);
        });
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

    getRecord(resultsetid, recno) {
        console.log(`Retreiving record ${recno}`)
        var presentRequest = createPresentRequest(resultsetid, recno)
        this.client.write(new Uint8Array(presentRequest.toBER()))
    }
}

function createIdBlock(tagNumber) {
    return {tagClass: 3, tagNumber: tagNumber}
}
    
function createInitRequest(username, password) {
    var auth = `${username}/${password}`
    var encoder = new TextEncoder()
    return new asn1js.Constructed({
        idBlock: createIdBlock(20),
        value: [
            new asn1js.Primitive({idBlock: createIdBlock(3), valueHex: new Uint8Array([0x00,0xE0]), unusedBits: 5}),
            new asn1js.Primitive({idBlock: createIdBlock(4), valueHex: new Uint8Array([0x00,0xE9,0xA2])}),
            new asn1js.Primitive({idBlock: createIdBlock(5), valueHex: new Uint8Array([0x04,0x00,0x00,0x00])}),
            new asn1js.Primitive({idBlock: createIdBlock(6), valueHex: new Uint8Array([0x04,0x00,0x00,0x00])}),
            new asn1js.Constructed({
                idBlock: createIdBlock(7), 
                value: [
                    new asn1js.VisibleString({valueHex: encoder.encode(auth)})
                ]
            }),
            new asn1js.Constructed({
                idBlock: createIdBlock(201), 
                value: [
                    new asn1js.Sequence({
                        value: [
                            new asn1js.Constructed({
                                idBlock: createIdBlock(4),
                                value: [
                                    new asn1js.ObjectIdentifier({value: UTF8_OBJID}),
                                    new asn1js.Constructed({
                                        idBlock: createIdBlock(0),
                                        value: [
                                            new asn1js.Constructed({
                                                idBlock: createIdBlock(1),
                                                value: [
                                                   new asn1js.Constructed({
                                                        idBlock: createIdBlock(1), 
                                                        value: [
                                                          new asn1js.Constructed({
                                                                idBlock: createIdBlock(2), 
                                                                value: [
                                                                    new asn1js.ObjectIdentifier({
                                                                        idBlock: createIdBlock(2), 
                                                                        value: UCS_OBJID
                                                                    }),
                                                                ]
                                                           })  
                                                        ]
                                                   }),
                                                   new asn1js.Primitive({idBlock: createIdBlock(3), valueHex: new Uint8Array([0x01])}),                                                   
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        ]
    })
}

function createCloseRequest() {
    return new asn1js.Constructed({
        idBlock: createIdBlock(48),
        value: [
            new asn1js.Primitive({idBlock: createIdBlock(211), value: 0})
        ]
    })
}
    
function createSearchRequest(database, rsid, queryString) {
    var encoder = new TextEncoder()
    return new asn1js.Constructed({
        idBlock: createIdBlock(22),
        value: [
            new asn1js.Primitive({idBlock: createIdBlock(13), valueHex: new Uint8Array([0x00])}),
            new asn1js.Primitive({idBlock: createIdBlock(14), valueHex: new Uint8Array([0x01])}),
            new asn1js.Primitive({idBlock: createIdBlock(15), valueHex: new Uint8Array([0x00])}),
            new asn1js.Primitive({idBlock: createIdBlock(16), valueHex: new Uint8Array([0x01])}),
            new asn1js.Primitive({idBlock: createIdBlock(17), valueHex: encoder.encode(rsid)}),
            new asn1js.Constructed({idBlock: createIdBlock(18), 
                value: [
                    new asn1js.Primitive({idBlock: createIdBlock(105), valueHex: encoder.encode(database)})
                ]}),
            new asn1js.Constructed({idBlock: createIdBlock(21),
                value: [
                    new asn1js.Constructed({idBlock: createIdBlock(1), 
                        value: [
                            new asn1js.ObjectIdentifier({value: BIB1_OBJID}),
                            new asn1js.Constructed({idBlock: createIdBlock(0),
                                value: [
                                    new asn1js.Constructed({idBlock: createIdBlock(102), 
                                        value: [
                                            new asn1js.Constructed({idBlock: createIdBlock(44),
                                                value: [
                                                    new asn1js.Sequence({
                                                        value: [
                                                            new asn1js.Primitive({idBlock: createIdBlock(120), valueHex: new Uint8Array([0x01])}),
                                                            new asn1js.Primitive({idBlock: createIdBlock(121), valueHex: new Uint8Array([0x0C])})
                                                        ]
                                                    })
                                                ]
                                            }),
                                            new asn1js.Primitive({idBlock: createIdBlock(45),
                                                valueHex: encoder.encode(queryString)
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        ]
    })
}

function createPresentRequest(rsid, recno) {
    var encoder = new TextEncoder()
    var marcObj = new asn1js.ObjectIdentifier({value: USMARC_OBJID})
    return new asn1js.Constructed({idBlock: createIdBlock(24),
        value: [
            new asn1js.Primitive({idBlock: createIdBlock(31), valueHex: encoder.encode(rsid)}),
            new asn1js.Primitive({idBlock: createIdBlock(30), valueHex: new Uint8Array([recno])}),
            new asn1js.Primitive({idBlock: createIdBlock(29), valueHex: new Uint8Array([0x01])}),
            new asn1js.Primitive({idBlock: createIdBlock(104), valueHex: marcObj.valueBlock.toBER()})
        ]
    })
}