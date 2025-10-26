const fs=require('fs'),path=require('path');const f=path.join(__dirname,'..','config.json')
function read(){try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return{rtmps:[]}}}
function write(c){fs.writeFileSync(f,JSON.stringify(c,null,2))}
module.exports={read,write}
