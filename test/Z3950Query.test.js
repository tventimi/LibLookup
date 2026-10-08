import { Z3950Query } from '../Z3950Query.js';

const recno = "abcd9876543210"
const recnoNormalized = "9876543210"
const title = "Z39.50: the Unsung Hero of the Space Race"
const subject = "Apollo Missions -- Apocrpyphal Accounts"

const optionalConfig = {
  "details": {
    "recnoIndex": 1007,
    "recnoNumeric": true, 
    "defaultStructure": 6
  }
}

describe('Z39.50 Query', () => {
  test('single parameter with custom config', () => {
    const inputQueryString = `keyword <> "${recno}"`
    const inputQueryStringRecno = `recno = "${recno}"`
    const zQuery = new Z3950Query(inputQueryString, optionalConfig)
    expect(zQuery.term).toBe(recno);
    expect(zQuery.type).toBe("operand");
    expect(zQuery.attributes).toEqual([
      {type: 1, value: 1016}, 
      {type: 2, value: 6}, 
      {type: 4, value: 6}
    ]);

    const zQueryRecno = new Z3950Query(inputQueryStringRecno,optionalConfig)
    expect(zQueryRecno.term).toBe(recnoNormalized);
    expect(zQueryRecno.type).toBe("operand");
    expect(zQueryRecno.attributes).toEqual([
      {type: 1, value: 1007},  
      {type: 4, value: 1}
    ]);
  });
  
  test('multi-parameter', () => {
    const inputQueryString = `title = "${title}" OR subject all "${subject}"`
    const zQuery = new Z3950Query(inputQueryString)
    expect(zQuery.type).toBe("operator");
    expect(zQuery.operator).toBe(1);
    expect(zQuery.leftOperand.term).toBe(title);
    expect(zQuery.leftOperand.attributes).toEqual([
      {type: 1, value: 4},  
      {type: 4, value: 1}
    ]);
    expect(zQuery.rightOperand.term).toBe(subject);
    expect(zQuery.rightOperand.attributes).toEqual([
      {type: 1, value: 21}
    ]);
  });

  test('empty parameters', () => {
    const inputQueryStringEmpty = `title = "" AND subject = ""`
    const inputQueryStringSimple = `4 = "" AND subject = "${subject}"`
    const inputQueryStringComplex = `title = "${title}" AND subject = "${subject}" NOT author = ""`
    const inputQueryStringComplex2 = `title = "${title}" AND something = "${subject}" OR author = ""`
    const zQueryEmpty = new Z3950Query(inputQueryStringEmpty)
    expect(zQueryEmpty.term).toBe("");
    expect(zQueryEmpty.type).toBe("operand");
    expect(zQueryEmpty.queryString).toBe("");
    
    const zQuerySimple = new Z3950Query(inputQueryStringSimple)
    expect(zQuerySimple.term).toBe(subject);
    expect(zQuerySimple.type).toBe("operand");
    expect(zQuerySimple.attributes).toEqual([
      {type: 1, value: 21},  
      {type: 4, value: 1}
    ]);
    const zQueryComplex = new Z3950Query(inputQueryStringComplex)
    expect(zQueryComplex.type).toBe("operator");
    expect(zQueryComplex.operator).toBe(0);
    expect(zQueryComplex.leftOperand.term).toBe(title);
    expect(zQueryComplex.leftOperand.attributes).toEqual([
      {type: 1, value: 4},  
      {type: 4, value: 1}
    ]);
    expect(zQueryComplex.rightOperand.term).toBe(subject);
    expect(zQueryComplex.rightOperand.attributes).toEqual([
      {type: 1, value: 21},  
      {type: 4, value: 1}
    ]);

    const zQueryComplex2 = new Z3950Query(inputQueryStringComplex2)
    expect(zQueryComplex2.type).toBe("operator");
    expect(zQueryComplex2.operator).toBe(0);
    expect(zQueryComplex2.leftOperand.term).toBe(title);
    expect(zQueryComplex2.leftOperand.attributes).toEqual([
      {type: 1, value: 4},  
      {type: 4, value: 1}
    ]);
    expect(zQueryComplex2.rightOperand.term).toBe(subject);
    expect(zQueryComplex2.rightOperand.attributes).toEqual([
      {type: 1, value: 1016},
      {type: 4, value: 1}
    ]);

  })

  test('both empty parameters', () => {
    const inputQueryString = `title = "" AND subject = ""`
    const zQuery = new Z3950Query(inputQueryString)
    expect(zQuery.term).toBe("");
    expect(zQuery.type).toBe("operand");
    expect(zQuery.queryString).toBe("");
  })

  test('raw query', () => {
    const inputQueryStringSimple = `raw = "@attr 4=1 ""${title}"""`
    const inputQueryStringComplex = `raw = "@or @attr 1=4 @attr 4=1 ""${title}"" @attr 1=21 @attr 4=1 ""${subject}"""`
     
    const zQuerySimple = new Z3950Query(inputQueryStringSimple)
    expect(zQuerySimple.term).toBe(title);
    expect(zQuerySimple.type).toBe("operand");
    expect(zQuerySimple.attributes).toEqual(
      expect.arrayContaining([
        {type: 1, value: 1016},  
        {type: 4, value: 1}
      ])
    );

    const zQueryComplex = new Z3950Query(inputQueryStringComplex)
    expect(zQueryComplex.type).toBe("operator");
    expect(zQueryComplex.operator).toBe(1);
    expect(zQueryComplex.leftOperand.term).toBe(title);
    expect(zQueryComplex.leftOperand.attributes).toEqual([
      {type: 1, value: 4},  
      {type: 4, value: 1}
    ]);
    expect(zQueryComplex.rightOperand.term).toBe(subject);
    expect(zQueryComplex.rightOperand.attributes).toEqual([
      {type: 1, value: 21},  
      {type: 4, value: 1}
    ]);
  })

  test('invalid query', () => {
    const inputQueryString = `title = "${title}" BLAH subject = "${subject}"`
    const zQuery = new Z3950Query(inputQueryString)
    expect(zQuery).not.toBeNull()

    const inputQueryStringRaw = `raw = "@attr BLAH ""test"""`
    const zQueryRaw = new Z3950Query(inputQueryStringRaw)
    expect(zQueryRaw).not.toBeNull()

  })
});
