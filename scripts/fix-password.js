require('dotenv').config()
const bcrypt=require('bcryptjs')
const db=require('../src/db')

;(async()=>{
 const username='Rene'
 const password='123456'

 const hash=await bcrypt.hash(password,10)

 await db.query(
  'UPDATE usuarios SET password_hash=$1 WHERE username=$2',
  [hash,username]
 )

 console.log('Password actualizado correctamente')
 process.exit(0)
})()
