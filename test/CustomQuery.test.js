import { CustomQuery } from '../CustomQuery.js';

describe('Custom Query', () => {
  const config = {
    "catalogLinkParams": "&includeExtraWeirdStuff=false",
    "pageParam": "page",
    "maxRecsParam": "limit",
    "indexes": [
      {"name":"Title","code":"title","paramName":"Title","relators":["all","="]},
      {"name":"Raw Query","code":"raw","relators":["="]},
      {"name":"Catalog Link","code":"link", "relators":["="]}
    ],
    "relators": {
      "all": ":",
      "default": "="
    }
  }

  const title = "The Epic Rise and Devastating Fall of LibLookup"
  const author = "Thomas Ventimiglia"
  const subject = "Information Science -- Cautionary Tales"

  test('single parameter string, using relator without "="', () => {
    const inputQueryString = `title all "${title}"`
    const outputQueryString = `Title:${title}`
    const customQuery = new CustomQuery(inputQueryString, config)
    expect(customQuery.queryString).toBe(outputQueryString);
  });
  
  test('multi-parameter string including "=" and parameter not in config', () => {
    const inputQueryString = `title = "${title}" AND mainAuthor = "${author}"`
    const outputQueryString = `Title="${title}" AND "${author}"`
    const customQuery = new CustomQuery(inputQueryString,config)
    expect(customQuery.queryString).toBe(outputQueryString);
    expect(customQuery.isCatalogLink).toBe(false);
  });

  test('catalog link query', () => {
    const urlPrefix = "https://tomcat.org/search?"
    const queryString = "search?query=LibLookup+Tips+and+Tricks"
    const extraParams = "&page=1&limit=10"
    const inputQueryString = `link = "${urlPrefix}${queryString}${extraParams}"`
    const outputQueryString = `${queryString}${config.catalogLinkParams}`
    const customQuery = new CustomQuery(inputQueryString,config)
    const {catalogLinkParams, ...altConfig} = config;
    //alternate query removes catalogLinkParams from config
    const altCustomQuery = new CustomQuery(inputQueryString,altConfig)
    expect(customQuery.queryString).toBe(outputQueryString);
    expect(customQuery.isCatalogLink).toBe(true);
    expect(altCustomQuery.queryString).toBe(queryString);
  });
  test('raw query', () => {
    const index = "subject"
    const inputQueryString = `raw = "${index}:""${subject}"""`
    const outputQueryString = `${index}:"${subject}"`
    const customQuery = new CustomQuery(inputQueryString,config)
    expect(customQuery.queryString).toBe(outputQueryString);
  });
});
