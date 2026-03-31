import{r as g,s as W,j as e,R as P,f as M,z as E}from"./index-DxVQJ7cZ.js";import{c as B}from"./cleanAiText-ekTVE-mU.js";import{M as _}from"./AdminMarketing-Bsdrt1p0.js";import{Z as F}from"./zap-BPvDtvC9.js";import{B as z}from"./book-open-CY5RLpIh.js";import{C as D}from"./copy-BxT22rsF.js";function H(){const[o,i]=g.useState([]),[l,d]=g.useState(!0);return g.useEffect(()=>{async function n(){d(!0);const{data:s}=await W.from("v_rankings_free").select("player_id, player_name, team, team_name, position, projection_final, ceiling, floor, consistency, form_score, matchup_rating, risk_rating, projection_confidence, neeko_rating, neeko_rating_scaled, price, prev_price, price_change, price_change_pct, value_score, best_value_score, value_tag, value_tier, consistency_tier, ai_recommendation, recommendation_strength, recommendation_color, recommendation_short, recommendation_why, summary_short, summary_long, games_played, status, manual_status, is_available, bye_round, is_bye").order("neeko_rating",{ascending:!1}).limit(300);s&&i(s),d(!1)}n()},[]),{players:o,loading:l}}const A="neeko-marketing-library";function G(){try{return JSON.parse(localStorage.getItem(A)??"[]")}catch{return[]}}function J(o){localStorage.setItem(A,JSON.stringify(o))}function U(o){const i={status:"idea",platform:null,metrics:{},...o,id:crypto.randomUUID(),createdAt:new Date().toISOString()},l=[i,...G()];return J(l),typeof window<"u"&&typeof window.__onLibraryAdd=="function"&&window.__onLibraryAdd(i),i}const T=[{id:"discussion",label:"Discussion Starter",desc:"Open-ended post inviting opinions"},{id:"hot_take",label:"Hot Take",desc:"Controversial opinion, invite pushback"},{id:"buy_sell",label:"Buy/Sell Debate",desc:"Should you pick them up or drop them?"},{id:"comparison",label:"Player Comparison",desc:"Compare vs similar tier option"},{id:"am_i_crazy",label:'"Am I crazy?"',desc:"Contrarian take, seeking validation"}],Y=[{id:"neutral",label:"Neutral"},{id:"aggressive",label:"Aggressive"},{id:"curious",label:"Curious"}];function x(o,i=0){return o==null?"?":o.toFixed(i)}function q(o){const i=o.recommendation_why??o.summary_short??"";return B(i).replace(/\*\*/g,"").replace(/#+\s/g,"").split(new RegExp("(?<=[.!?])\\s+")).filter(n=>n.length>10&&!n.toLowerCase().includes("neeko")).slice(0,2).join(" ").trim()}function Q(o){const i=o.risk_rating??0;return i>=7?"high risk":i>=5?"moderate risk":"low risk"}function Z(o){const i=o.value_score??0;return i>=70?"good value":i>=45?"fair value":"overpriced"}function K(o){const i=o.form_score??0;return i>=7?"in decent touch":i>=5?"rolling along okay":"a bit patchy recently"}function V(o){const i=o.price;return i?`$${(i/1e3).toFixed(0)}k`:null}function X(o,i){const l=o.projection_final??0,d=i.filter(n=>n.player_name!==o.player_name&&n.position===o.position&&n.is_available!==!1&&n.projection_final!=null&&Math.abs((n.projection_final??0)-l)<=12);return d.length?d[Math.floor(Math.random()*Math.min(d.length,5))]:null}function u(o){return o[Math.floor(Math.random()*o.length)]}function L(o,i,l,d){const n=o.player_name,s=x(o.projection_final),h=x(o.ceiling),f=x(o.floor),c=Q(o),r=Z(o),m=K(o),b=V(o),t=q(o),N=(o.ai_recommendation??"").toLowerCase(),y=X(o,d),p=(y==null?void 0:y.player_name)??"another option at this tier",j=x(y==null?void 0:y.projection_final);let a="";if(i==="discussion"&&(l==="neutral"?a=u([`Is anyone else going back and forth on ${n} this week?

Projection sits around ${s} which isn't bad, but the range is pretty wide — could see anything from ${f} to ${h}. ${t?t+`

`:""}Not saying don't start him, just feels like there are a few question marks I can't fully ignore.`,`How are people feeling about ${n} heading into this round?

Numbers look solid on paper — projecting around ${s} — but I keep second-guessing it. ${r==="good value"?"At least the price is reasonable.":"Price feels a bit steep too."}

Curious what others think.`,`${n} this week — comfortable or hesitant?

Projection is ~${s} and he's been ${m}. ${t||""}

Just want to see if I'm reading this right.`]):l==="aggressive"?a=u([`Can we talk about ${n} for a second because I think people are sleeping on him.

Projection of ${s} with ceiling up around ${h}? If the role holds that's a genuine week-winner.

${t||"The underlying numbers back it up."}

Who's actually locking him in?`,`${n} is a must-start this week and I don't think it's even close.

${s} projection, upside to ${h}, and he's been ${m}. What more do you need?

If you're benching him you're overthinking it.`]):a=u([`Am I reading too much into the ${n} numbers or is there genuinely something interesting here?

Projection of ${s}, ceiling around ${h}. ${t||""}

Just not sure if I'm seeing something real or making it up. What are other people seeing?`,`What's the actual take on ${n} this week?

I've been going back and forth for days. ${s} projection sounds fine but then I look at the matchup and I'm not so sure.

${t||""}

Honestly just need someone to help me make a call here.`])),i==="hot_take"&&(l==="neutral"?a=u([`Might be wrong on this but I think ${n} is a trap this week.

Projection of ${s} looks fine on the surface but when you dig in a bit the value isn't really there${b?` at ${b}`:""}. ${t||""}

Feel like he's one of those picks that gets hyped and then posts 75 when everyone's counting on 110.`,`Unpopular opinion: ${n} is being overrated this week.

The hype doesn't match the underlying numbers. ${c==="high risk"?"Risk is legitimately high and people are glossing over that.":""} ${t||""}

Take the fade.`]):l==="aggressive"?a=u([`${n} is a trap. Said it.

Everyone's projecting him around ${s} but the risk is ${c} and ${r!=="good value"?"he's not good value at this price":"I've seen better spots for him"}. ${t||""}

This is exactly the kind of pick that burns captains in crunch rounds. Hard pass.`,`I genuinely cannot believe people are still trusting ${n} this week.

Projection at ${s}, floor at ${f}. That floor is a problem. ${t||""}

If you're playing him you better know what you're getting into.`]):a=u([`Is ${n} actually a trap or am I just being paranoid?

Projection looks okay (~${s}) but I've got this feeling the numbers are a bit generous. ${t||""}

Maybe I'm overthinking it but something feels off. Anyone else get that?`,`Something about ${n} this week is making me nervous and I can't put my finger on it.

On paper he's fine — ${s} projection, ${m} — but there's something about the setup that doesn't sit right.

${t||""}

Might just be instinct but I'm probably fading.`])),i==="buy_sell"){const $=N.includes("buy")||N.includes("hold");l==="neutral"?a=u([`Buy or sell ${n} at ${b??"current price"}?

Projecting around ${s} and been ${m}. ${t||""}

I keep going back and forth. At ${b??"this price"} it's not like you're paying a massive premium, but if he underperforms a few times the price won't hold.

What's the call?`,`Trade question — is ${n} a buy, hold, or sell right now?

${s} projection, ${r}, ${c} profile. ${t||""}

I feel like the window to ${$?"buy":"sell"} might be closing. What are people doing?`]):l==="aggressive"?a=u([`${$?"BUY":"SELL"} ${n} now. Posting this so I'm accountable.

${s} projection, ${r}. ${t||""}

If you're sitting on the fence you're going to miss the move. The numbers are clear.`,`Strong ${$?"buy":"sell"} on ${n} this week — price is going ${$?"up":"down"}.

${t||`Projecting ${s} and the value play is obvious.`}

Don't overthink it.`]):a=u([`Genuinely curious — are people buying or selling ${n} right now?

Projection of ~${s} and ${r} at ${b??"this price"}. ${t||""}

I can see both sides and that's kind of the problem. What are you doing with him?`,`Is the ${$?"buy":"sell"} window on ${n} closing?

${t||`Projecting ${s}.`}

Feel like if I don't make a move soon I'm going to miss it and just end up with a mediocre outcome either way.`])}i==="comparison"&&(l==="neutral"?a=u([`${n} or ${p} this week? Can't decide.

${n} is projecting ~${s}, ${p} is around ${j}. ${n} has the higher ceiling but ${p} feels more reliable.

${t?t+`

`:""}I know the "right" answer is probably ${n} on paper but something is making me want to take the safer option. Anyone gone through this?`,`Straight swap question — ${n} vs ${p}?

Similar tier, different profiles. ${n} at ~${s}, ${p} at ~${j}.

${t||""}

I've been flip-flopping on this for a while. Just want to commit.`]):l==="aggressive"?a=u([`${n} over ${p} every day of the week.

${s} vs ${j}. The ceiling difference alone makes this a no-brainer.

${t||""}

Stop overthinking the "safe" option.`,`If you're picking ${p} over ${n} this week you're leaving points on the table.

Higher projection, better upside, ${m}. ${t||""}

Bold call but I'm locked in.`]):a=u([`Okay I need a second opinion — ${n} or ${p}?

${n}: ~${s} projection, ${r}, ${m}.
${p}: ~${j} projection, different risk profile.

${t?t+`

`:""}I feel like I'm going to talk myself into the wrong one. What's the read?`,`What am I missing with the ${n} vs ${p} decision?

${n} projecting higher (~${s}) but ${p} feels more consistent.

${t||""}

Maybe someone can give me a reason to just commit to one.`])),i==="am_i_crazy"&&(l==="neutral"?a=u([`Am I crazy for not starting ${n} this week?

Everyone seems to be all over him — projection of ~${s}, ${m} — but I just can't bring myself to do it.

${t||""}

Maybe I'm wrong. Probably am. But something about this spot feels off and I can't ignore it.`,`Tell me I'm wrong about ${n}.

Projection looks solid (~${s}), he's ${m}, and the value is ${r}. On paper I should be starting him without thinking.

${t||""}

But I've got a bad feeling and I need someone to either confirm I'm crazy or validate it.`]):l==="aggressive"?a=u([`Fight me on this: ${n} isn't the safe pick everyone thinks he is.

${s} projection but ${f} floor and ${c} profile. ${t||""}

I keep seeing him in everyone's team and it's making me more confident in the fade, not less.`,`I'm benching ${n} this week and I'm going to catch hell for it.

${t||`${s} projection doesn't tell the whole story.`} Risk is real and I'm not going to ignore it because it's contrarian.

Change my mind.`]):a=u([`Is it weird that I'm nervous about ${n} even though the numbers look fine?

Projection of ~${s}, ${m}, ${r}. Nothing obviously wrong.

${t||""}

Maybe I'm pattern-matching to a bad memory. Or maybe the gut feeling is picking up something the data isn't showing. Not sure.`,`Why can't I just commit to ${n}?

All the signals say start him — ~${s} projection, ${m}, ${r}. And yet.

${t||""}

Anyone else get this paralysis on players that should be obvious?`]));const I=[`Yeah I'm kind of in the same boat. ${s} looks reasonable but there's definitely some variance baked in. Going with it but not feeling great about it.`,"This is basically exactly my thought process. The projection is fine but I keep coming back to the floor and wondering if it's worth it.","Same. I've been going back and forth and I think I've landed on starting him but it's not a confident decision.","Honestly I've been sitting on this all week and I think you're right. Something about the setup doesn't feel clean.","Yeah the numbers look okay on paper but the underlying stuff is a bit murky. I get why you're uncertain."],v=[`I actually think you're overthinking it. ${s} projection with that ceiling is a fairly clear start in most formats.`,"Disagree a bit here. The risk stuff is real but the upside justifies it. You're not going to find a clean pick at this price point.","Counter: the form has been solid enough that I think the floor is higher than people are pricing in. I'm locking him in.","I've had this guy on my watchlist all week and I'm going the other way — full confidence. The projection is conservative if anything.",'Respectfully pushing back. The value at this price is actually pretty good and I think the "trap" narrative is doing more harm than good.'],w=["The way I'm thinking about it — if the projection holds he's a solid mid-tier pick. If the floor comes in you're not catastrophically hurt. Somewhere in the middle.","Probably comes down to your team structure. If you've got cover he's fine as a flex. If you need a big score he might not be the guy.",`Worth noting the ceiling is ${h} so there is genuine upside. Just depends how much variance you can handle in your lineup.`,"I think both perspectives have merit here. He's not a must-start but he's also not an obvious fade. Context-dependent.",`From what I can see the numbers are legitimately in that "fine but not exciting" zone. Whether that's good enough depends on your roster.`],R=[u(I),u(v),u(w)],S=["What are people seeing that I'm missing here? Genuinely asking.","Is this just overthinking it or is there actually something to this?","Anyone changed their mind on him in the last day or two based on anything?","What's the worst-case scenario look like if this goes wrong? That's what I keep coming back to.","Is anyone else in the same spot or am I the only one who can't commit?","How confident is everyone actually feeling — like honest answer, not just the pick?"],C=u(S),O=u(S.filter($=>$!==C));return{post:a,replies:R,followups:[C,O]}}function k({text:o,label:i="Copy"}){const[l,d]=g.useState(!1);function n(){o.trim()&&navigator.clipboard.writeText(o).then(()=>{d(!0),setTimeout(()=>d(!1),2e3)})}return e.jsxs("button",{onClick:n,className:"flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/40",children:[l?e.jsx(M,{className:"h-3 w-3 text-emerald-500"}):e.jsx(D,{className:"h-3 w-3"}),l?"Copied":i]})}function ee({thread:o,playerName:i,onSave:l}){const d=["POST:",o.post,"","REPLIES:",`1. ${o.replies[0]}`,`2. ${o.replies[1]}`,`3. ${o.replies[2]}`,"","FOLLOW-UPS:",`1. ${o.followups[0]}`,`2. ${o.followups[1]}`].join(`
`);return e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"rounded-xl border border-border bg-card overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(_,{className:"h-3.5 w-3.5 text-muted-foreground"}),e.jsx("p",{className:"text-xs font-semibold",children:"Main Post"})]}),e.jsx(k,{text:o.post})]}),e.jsx("div",{className:"px-4 py-3",children:e.jsx("pre",{className:"text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans",children:o.post})})]}),e.jsxs("div",{className:"rounded-xl border border-border bg-card overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(_,{className:"h-3.5 w-3.5 text-muted-foreground"}),e.jsx("p",{className:"text-xs font-semibold",children:"Comment Replies"})]}),e.jsx(k,{text:o.replies.map((n,s)=>`${s+1}. ${n}`).join(`

`),label:"Copy All"})]}),e.jsx("div",{className:"divide-y divide-border/40",children:[{reply:o.replies[0],label:"Agree",accent:"text-emerald-600 dark:text-emerald-400",bg:"bg-emerald-50 dark:bg-emerald-900/20"},{reply:o.replies[1],label:"Counter",accent:"text-red-500",bg:"bg-red-50 dark:bg-red-900/20"},{reply:o.replies[2],label:"Neutral",accent:"text-blue-500",bg:"bg-blue-50 dark:bg-blue-900/20"}].map(({reply:n,label:s,accent:h,bg:f})=>e.jsxs("div",{className:"px-4 py-3 space-y-2",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${f} ${h}`,children:s}),e.jsx(k,{text:n})]}),e.jsx("p",{className:"text-xs text-muted-foreground leading-relaxed",children:n})]},s))})]}),e.jsxs("div",{className:"rounded-xl border border-border bg-card overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20",children:[e.jsx("p",{className:"text-xs font-semibold",children:"Follow-up Questions"}),e.jsx(k,{text:o.followups.join(`

`),label:"Copy All"})]}),e.jsx("div",{className:"divide-y divide-border/40",children:o.followups.map((n,s)=>e.jsxs("div",{className:"flex items-center justify-between px-4 py-3 gap-3",children:[e.jsx("p",{className:"text-xs text-muted-foreground leading-relaxed flex-1",children:n}),e.jsx(k,{text:n})]},s))})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx(k,{text:d,label:"Copy Full Thread Pack"}),e.jsxs("button",{onClick:l,className:"flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground",children:[e.jsx(z,{className:"h-3.5 w-3.5"}),"Save to Library"]})]})]})}function te({players:o,value:i,onChange:l}){const[d,n]=g.useState(""),[s,h]=g.useState(!1),f=g.useMemo(()=>{const r=d.toLowerCase().trim();return r?o.filter(m=>m.player_name.toLowerCase().includes(r)||m.team.toLowerCase().includes(r)).slice(0,30):o.slice(0,40)},[o,d]),c=o.find(r=>r.player_name===i);return e.jsxs("div",{className:"relative",children:[e.jsxs("button",{onClick:()=>h(r=>!r),className:"w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-border rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors text-left",children:[e.jsx("span",{className:c?"text-foreground":"text-muted-foreground",children:c?c.player_name:"Select player..."}),c&&e.jsxs("span",{className:"text-[10px] text-muted-foreground/60 shrink-0",children:[c.team," · ",x(c.projection_final)," proj"]}),e.jsx(E,{className:`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${s?"rotate-180":""}`})]}),s&&e.jsxs("div",{className:"absolute z-30 top-full mt-1 w-full bg-background border border-border rounded-xl shadow-xl overflow-hidden",children:[e.jsx("div",{className:"p-2 border-b border-border",children:e.jsx("input",{autoFocus:!0,type:"text",placeholder:"Search player or team...",value:d,onChange:r=>n(r.target.value),className:"w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring"})}),e.jsxs("div",{className:"max-h-56 overflow-y-auto divide-y divide-border/30",children:[f.map(r=>e.jsxs("button",{onClick:()=>{l(r.player_name),h(!1),n("")},className:"w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-left",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-medium",children:r.player_name}),e.jsxs("p",{className:"text-[10px] text-muted-foreground",children:[r.team," · ",r.position]})]}),e.jsxs("div",{className:"text-right shrink-0",children:[e.jsxs("p",{className:"text-[10px] font-semibold text-muted-foreground",children:[x(r.projection_final)," proj"]}),r.ai_recommendation&&e.jsx("p",{className:"text-[9px] text-muted-foreground/60 capitalize",children:r.ai_recommendation})]})]},r.player_name)),f.length===0&&e.jsx("p",{className:"text-xs text-muted-foreground text-center py-4",children:"No players found."})]})]})]})}function de(){const{players:o,loading:i}=H(),[l,d]=g.useState(""),[n,s]=g.useState("discussion"),[h,f]=g.useState("neutral"),[c,r]=g.useState(null),[m,b]=g.useState(!1),t=g.useMemo(()=>o.find(a=>a.player_name===l)??null,[o,l]);function N(){t&&(b(!1),r(L(t,n,h,o)))}function y(){t&&(b(!1),r(L(t,n,h,o)))}function p(){var I;if(!c||!t)return;const a=["POST:",c.post,"","REPLIES:",c.replies.map((v,w)=>`${w+1}. ${v}`).join(`
`),"","FOLLOW-UPS:",c.followups.map((v,w)=>`${w+1}. ${v}`).join(`
`)].join(`
`);U({type:"script",title:`Reddit — ${t.player_name} (${(I=T.find(v=>v.id===n))==null?void 0:I.label})`,content:a,player:t.player_name,tags:["reddit","conversation",n,h],status:"idea",platform:"reddit"}),b(!0),setTimeout(()=>b(!1),3e3)}const j=!!t;return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-sm font-semibold flex items-center gap-2",children:[e.jsx(_,{className:"h-4 w-4 text-muted-foreground"}),"Reddit Conversation Engine"]}),e.jsx("p",{className:"text-xs text-muted-foreground mt-0.5",children:"Generate natural Reddit posts, comment replies, and follow-up questions from live player data."})]}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-border bg-card",children:[e.jsxs("div",{className:"sm:col-span-3 space-y-1.5",children:[e.jsx("label",{className:"text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60",children:"Player"}),i?e.jsxs("div",{className:"flex items-center gap-2 text-xs text-muted-foreground py-2",children:[e.jsx(P,{className:"h-3.5 w-3.5 animate-spin"})," Loading players..."]}):e.jsx(te,{players:o,value:l,onChange:d})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60",children:"Mode"}),e.jsx("div",{className:"space-y-1",children:T.map(a=>e.jsxs("button",{onClick:()=>s(a.id),className:`w-full text-left px-3 py-2 rounded-lg border transition-colors text-xs ${n===a.id?"border-foreground/40 bg-foreground/5 font-semibold":"border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground"}`,children:[e.jsx("span",{className:"font-medium",children:a.label}),e.jsx("span",{className:"block text-[10px] text-muted-foreground/60 mt-0.5",children:a.desc})]},a.id))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60",children:"Tone"}),e.jsx("div",{className:"space-y-1",children:Y.map(a=>e.jsx("button",{onClick:()=>f(a.id),className:`w-full text-left px-3 py-2 rounded-lg border transition-colors text-xs ${h===a.id?"border-foreground/40 bg-foreground/5 font-semibold":"border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground"}`,children:a.label},a.id))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60",children:"Player Data"}),t?e.jsxs("div",{className:"rounded-lg border border-border bg-muted/10 p-3 space-y-2 text-xs",children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-semibold",children:t.player_name}),e.jsxs("p",{className:"text-muted-foreground",children:[t.team," · ",t.position]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-1.5 text-[11px]",children:[e.jsxs("div",{children:[e.jsx("span",{className:"text-muted-foreground/60",children:"Proj"}),e.jsx("span",{className:"ml-1 font-medium",children:x(t.projection_final)})]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-muted-foreground/60",children:"Ceil"}),e.jsx("span",{className:"ml-1 font-medium",children:x(t.ceiling)})]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-muted-foreground/60",children:"Floor"}),e.jsx("span",{className:"ml-1 font-medium",children:x(t.floor)})]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-muted-foreground/60",children:"Value"}),e.jsx("span",{className:"ml-1 font-medium",children:x(t.value_score)})]})]}),t.ai_recommendation&&e.jsx("p",{className:"text-[10px] capitalize text-muted-foreground/70 border-t border-border pt-1.5",children:t.ai_recommendation})]}):e.jsx("div",{className:"rounded-lg border border-dashed border-border p-4 flex items-center justify-center text-muted-foreground/40 text-xs",children:"Select a player"})]})]}),e.jsxs("button",{onClick:N,disabled:!j,className:"flex items-center gap-2 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity",children:[e.jsx(F,{className:"h-4 w-4"}),"Generate Thread"]}),c&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("p",{className:"text-xs font-semibold text-muted-foreground uppercase tracking-widest",children:"Generated Thread"}),e.jsxs("div",{className:"flex items-center gap-2",children:[m&&e.jsxs("span",{className:"text-[11px] text-emerald-500 flex items-center gap-1",children:[e.jsx(M,{className:"h-3 w-3"})," Saved to Library"]}),e.jsxs("button",{onClick:y,className:"flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors",children:[e.jsx(P,{className:"h-3 w-3"})," Regenerate"]})]})]}),e.jsx(ee,{thread:c,playerName:(t==null?void 0:t.player_name)??"",onSave:p})]}),!c&&j&&e.jsx("div",{className:"flex items-center justify-center py-12 rounded-xl border border-dashed border-border text-muted-foreground/40 text-xs",children:"Hit Generate to build the thread"}),!c&&!j&&e.jsx("div",{className:"flex items-center justify-center py-12 rounded-xl border border-dashed border-border text-muted-foreground/40 text-xs",children:"Select a player to get started"})]})}export{de as default};
