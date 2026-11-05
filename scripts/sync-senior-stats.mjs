import fs from 'node:fs/promises';
const token=process.env.PLAY_CRICKET_API_TOKEN;
if(!token) throw new Error('PLAY_CRICKET_API_TOKEN is required');
const season=Number(process.env.SEASON||2026);
const siteId='11231';
async function api(path,params){
 const u=new URL('https://www.play-cricket.com/api/v2/'+path);
 for(const [k,v] of Object.entries({...params,api_token:token}))u.searchParams.set(k,String(v));
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(u);
  if(r.ok)return r.json();
  if(attempt===2||r.status<500&&r.status!==429)throw Error('Play-Cricket HTTP '+r.status);
  await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
 }
}
const summary=await api('result_summary.json',{site_id:siteId,season});
if(!Array.isArray(summary.result_summary))throw Error('Unexpected result_summary response');
const matches=[];
for(const item of summary.result_summary){
 if(!item.id||item.status==='Deleted')continue;
 const detail=(await api('match_detail.json',{match_id:item.id})).match_details?.[0];
 if(!detail?.innings)continue;
 const homeOwn=String(detail.home_club_id)===siteId,awayOwn=String(detail.away_club_id)===siteId;
 if(!homeOwn&&!awayOwn)continue;
 const teamName=String(homeOwn?detail.home_team_name:detail.away_team_name||'');
 const text=[teamName,String(item.team_name||''),String(detail.competition_name||'')].join(' ').toLowerCase();
 // Conservative classification: do not silently treat unknown or junior sides as senior men.
 const junior=/\b(u(?:nder)?[- ]?\d{1,2}|junior|youth|colts)\b/i.test(text);
 const women=/women|ladies|female/i.test(text);
 const men=/men|mens|senior|\b[1-6](?:st|nd|rd|th)?\s*(?:xi|team)\b/i.test(text);
 const category=junior?'excluded-junior':women?'women':men?'men':'unclassified';
 const ownTeamId=String(homeOwn?detail.home_team_id:detail.away_team_id);
 const opponent=homeOwn?detail.away_club_name:detail.home_club_name;
 const players=[];
 for(const inn of detail.innings){
  const batting=String(inn.team_batting_id)===ownTeamId;
  const bowling=String(inn.team_batting_id)!==ownTeamId;
  if(batting)for(const p of inn.bat||[]){
   if(!p.batsman_name)continue;
   players.push({name:p.batsman_name,kind:'batting',runs:Number(p.runs)||0,balls:p.balls==null?null:Number(p.balls),dismissal:p.how_out??p.dismissal??null});
  }
  if(bowling)for(const p of inn.bowl||[]){
   if(!p.bowler_name)continue;
   players.push({name:p.bowler_name,kind:'bowling',wickets:Number(p.wickets)||0,runsConceded:Number(p.runs)||0,overs:p.overs??null});
  }
 }
 matches.push({matchId:item.id,date:detail.match_date,team:teamName,category,opponent,players});
 await new Promise(resolve=>setTimeout(resolve,200));
}
const output={season,updated:new Date().toISOString().slice(0,10),matches};
await fs.mkdir('data',{recursive:true});
await fs.writeFile('data/senior-stats-2026.json',JSON.stringify(output,null,2)+'\n');
console.log('Processed '+matches.length+' matches; categories:',matches.reduce((a,m)=>(a[m.category]=(a[m.category]||0)+1,a),{}));
