// Simple tokenizer to split by whitespace but preserve quoted strings
export function tokenize(str) {
    str = str.replaceAll(/\"\"/g,"{quote}")
    const regex = /@\w+|@attr \d+=\d+|"([^"\\]|\\.)+"|[^\s]+/g;
    let matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[0].replaceAll("{quote}","\""));
    }
    return matches;
}