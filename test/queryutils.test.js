import { tokenize } from '../queryutils.js';

test('single parameter string', () => {
  const queryString = 'keyword = BFG'
  expect(tokenize(queryString)).toEqual(['keyword','=','BFG']);
});

test('single parameter string with quotes', () => {
  const queryString = 'keyword = "Willy Wonka"'
  expect(tokenize(queryString)).toEqual(['keyword','=','"Willy Wonka"']);
});

test('multi-parameter string', () => {
  const queryString = 'author == "Roald Dahl" AND title all "chocolate factory"'
  expect(tokenize(queryString)).toEqual(['author','==','"Roald Dahl"','AND','title','all','"chocolate factory"']);
});
