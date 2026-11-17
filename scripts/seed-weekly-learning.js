const WeeklyLearning=require('../js/weekly-learning');

const base=process.env.APP_URL||'http://localhost:3000';
async function request(path,{method='GET',token,body}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||`${method} ${path} failed (${response.status})`);
  return payload;
}
async function main(){
  const login=await request('/api/auth/login',{method:'POST',body:{username:process.env.SEED_ADMIN_USER||'admin',password:process.env.SEED_ADMIN_PASSWORD||'admin123'}});
  const {records}=await request('/api/storage',{token:login.token});
  const generated=WeeklyLearning.build(records.subjects||[],records.sectionSubjects||[]);
  const content=[...(records.subjectWorkspaceContent||[]).filter(item=>!String(item.id||'').startsWith('curr-')&&!String(item.id||'').startsWith('demo-ccs211-content-')),...generated.content];
  const exams=[...(records.exams||[]).filter(item=>!String(item.id||'').startsWith('CURR-')),...generated.exams];
  const questions=[...(records.questions||[]).filter(item=>!String(item.id||'').startsWith('CURR-')),...generated.questions];
  for(const [key,value] of Object.entries({subjectWorkspaceContent:content,exams,questions}))await request(`/api/storage/${key}`,{method:'PUT',token:login.token,body:{value}});
  console.log(JSON.stringify({subjects:Object.keys(WeeklyLearning.plans).length,weeksPerSubject:14,pages:generated.content.filter(item=>item.type!=='exam').length,quizzes:generated.exams.length,questions:generated.questions.length},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
