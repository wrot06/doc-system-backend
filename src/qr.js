const QRCode=require('qrcode')
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib')

exports.insertQR=async(pdfBuffer,radicado,url)=>{
 const pdf=await PDFDocument.load(pdfBuffer)
 const page=pdf.getPages()[pdf.getPages().length-1]

 const qrData=await QRCode.toDataURL(url,{margin:1,width:200})
 const qrImg=await pdf.embedPng(qrData)

 const font=await pdf.embedFont(StandardFonts.Helvetica)
 const {width,height}=page.getSize()

 page.drawImage(qrImg,{
  x:40,
  y:40,
  width:90,
  height:90
 })

 page.drawText(`Radicado: ${radicado}`,{
  x:40,
  y:135,
  size:9,
  font,
  color:rgb(0,0,0)
 })

 return Buffer.from(await pdf.save())
}