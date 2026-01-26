import {exec} from "child_process";

export const optimizeToPDFA=(input,output)=>new Promise((resolve,reject)=>{
 const cmd=`gs -dPDFA=2 -dBATCH -dNOPAUSE -dNOOUTERSAVE \
 -sProcessColorModel=DeviceRGB \
 -sDEVICE=pdfwrite \
 -dPDFACompatibilityPolicy=1 \
 -dDetectDuplicateImages=true \
 -dDownsampleColorImages=true \
 -dColorImageResolution=150 \
 -sOutputFile=${output} ${input}`;
 exec(cmd,e=>e?reject(e):resolve());
});