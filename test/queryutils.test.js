import { tokenize } from '../queryutils.js';

describe('Tokenizer used across query classes', () => {
  test('single parameter string', () => {
    const tokens = ['keyword','=','BFG']
    const queryString = tokens.join(' ')
    expect(tokenize(queryString)).toEqual(tokens);
  });

  test('single parameter string with quotes', () => {
    const tokens = ['keyword','=','"Willy Wonka"']
    const queryString = tokens.join(' ')
    expect(tokenize(queryString)).toEqual(tokens);
  });

  test('multi-parameter string', () => {
    const tokens = ['author','==','"Roald Dahl"','AND','title','all','"chocolate factory"']
    const queryString = tokens.join(' ')
    expect(tokenize(queryString)).toEqual(tokens);
  });
});
