import { SRUQuery } from '../SRUQuery.js';

describe('Alma SRU Query', () => {
  test('single parameter string', () => {
    const inputQueryString = 'keyword = AWK'
    const almaQueryString = 'alma.all_for_ui = AWK'
    const sruQuery = new SRUQuery(inputQueryString)
    expect(sruQuery.queryString).toBe(almaQueryString);
    expect(sruQuery.barcode).toBeNull()
  });

  test('multi-parameter string including barcode and empty parameter', () => {
    const barcode = "12345"
    const inputQueryString = `alma.url empty "[empty]" AND alma.barcode = "${barcode}"`
    const almaQueryString = `alma.url = "" AND alma.barcode = "${barcode}"`
    const sruQuery = new SRUQuery(inputQueryString)
    expect(sruQuery.queryString).toBe(almaQueryString);
    expect(sruQuery.barcode).toBe(barcode)
  });

  test('raw query', () => {
    const inputQueryString = 'raw = "alma.title == ""AWK Programming"""'
    const almaQueryString = '(alma.title == "AWK Programming" )'
    const sruQuery = new SRUQuery(inputQueryString)
    expect(sruQuery.queryString).toBe(almaQueryString);
  });
});
