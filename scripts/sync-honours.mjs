import fs from 'node:fs/promises';
const key=process.env.PLAY_CRICKET_API_TOKEN;
if(!key)throw new Error('Missing configured Actions secret');
const season=process.env.SEASON||'2026';
async function api(endpoint,params){const url=new URL('https://www.play-cricket.com/api/v2/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));url.searchParams.set('api_token',key);const res=await fetch(url);if(!res.ok)throw new Error('API returned '+res.status);return res.json()}
const list=await api('result_summary.json',{site_id:11231,season});
if(!Array.isArray(list.result_summary))throw new Error('Unexpected result list');
const records=[];
for(const match of list.result_summary){if(!match.id||match.status==='Deleted')continue;
const data=await api('match_detail.json',{match_id:match.id});const detail=data.match_details?.[0];if(!detail?.innings)continue;
const home=String(detail.home_team_id),away=String(detail.away_team_id);
for(const innings of detail.innings){const batting=String(innings.team_batting_id);const homeBat=batting===home;const awayBat=batting===away;if(!homeBat&&!awayBat)continue;
const ownBat=homeBat?String(detail.home_club_id)==='11231':String(detail.away_club_id)==='11231';
const opponent=ownBat?(homeBat?detail.away_club_name:detail.home_club_name):(homeBat?detail.home_club_name:detail.away_club_name);
const entries=ownBat?innings.bat:innings.bowl;
for(const p of entries||[]){const value=Number(ownBat?p.runs:p.wickets);if(value<(ownBat?50:4))continue;
const player=ownBat?p.batsman_name:p.bowler_name;if(!player)continue;
const runsConceded=Number(p.runs);
if(!ownBat&&!Number.isFinite(runsConceded))continue;
records.push({season:Number(season),type:ownBat?'batting':'bowling',player,opponent,date:detail.match_date,match_id:match.id,score:ownBat?String(value):value+'-'+runsConceded,...(ownBat?{runs:value}:{wickets:value,runs_conceded:runsConceded})});
}}
await new Promise(resolve=>setTimeout(resolve,200));
}
let old={records:[]};try{old=JSON.parse(await fs.readFile('data/honours.json','utf8'))}catch{}
const all=[...(old.records||[]).filter(x=>String(x.season)!==season),...records];
await fs.mkdir('data',{recursive:true});await fs.writeFile('data/honours.json',JSON.stringify({updated:new Date().toISOString().slice(0,10),records:all},null,2)+'\n');
console.log('Published '+records.length+' records for '+season);
