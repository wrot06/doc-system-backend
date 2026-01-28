const {exec}=require('child_process')
const fs=require('fs')

exports.toPDFA=(buffer)=>new Promise((resolve,reject)=>{
 const inFile=`/tmp/in-${Date.now()}.pdf`
 const outFile=`/tmp/out-${Date.now()}.pdf`
 fs.writeFileSync(inFile,buffer)

 const cmd=`gs -dPDFA=2 -dBATCH -dNOPAUSE -dNOOUTERSAVE \
 -sDEVICE=pdfwrite -dPDFACompatibilityPolicy=1 \
 -dDetectDuplicateImages=true \
 -dDownsampleColorImages=true -dColorImageResolution=150 \
 -sOutputFile=${outFile} ${inFile}`

 exec(cmd,e=>{
  fs.unlinkSync(inFile)
  if(e) return reject(e)
  const out=fs.readFileSync(outFile)
  fs.unlinkSync(outFile)
  resolve(out)
 })
})