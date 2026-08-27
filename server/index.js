import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());
const port = process.env.PORT || 3001;
let token = { value: null, expiresAt: 0 };

async function amadeusToken() {
  if (!process.env.AMADEUS_CLIENT_ID || !process.env.AMADEUS_CLIENT_SECRET) return null;
  if (token.value && token.expiresAt > Date.now() + 60_000) return token.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.AMADEUS_CLIENT_ID, client_secret: process.env.AMADEUS_CLIENT_SECRET });
  const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error('Amadeus authentication failed');
  const json = await response.json();
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}
function time(value) { return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function duration(value = 'PT0H0M') { const m = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return `${m?.[1] || 0}h ${m?.[2] || 0}m`; }
async function amadeusOffers(origin, destination) {
  const access = await amadeusToken(); if (!access) return [];
  const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const url = new URL('https://test.api.amadeus.com/v2/shopping/flight-offers');
  url.search = new URLSearchParams({ originLocationCode: origin, destinationLocationCode: destination, departureDate: date, adults: '1', max: '12', currencyCode: 'INR' });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!response.ok) throw new Error('Amadeus fare search failed');
  const json = await response.json();
  return json.data.map(offer => { const leg = offer.itineraries[0]; const first = leg.segments[0], last = leg.segments.at(-1); return { airline: first.carrierCode, code: `${first.carrierCode} ${first.number}`, dep: time(first.departure.at), arr: time(last.arrival.at), duration: duration(leg.duration), price: Number(offer.price.grandTotal), stops: leg.segments.length === 1 ? 'Non-stop' : `${leg.segments.length - 1} stop`, source: 'Amadeus' }; });
}
const preview = [{route:'DEL → BOM',lowest:5240,change:-12},{route:'DEL → BLR',lowest:4980,change:4},{route:'BOM → DEL',lowest:5720,change:8},{route:'MAA → DEL',lowest:6450,change:-3}];
const airports = { DEL:{name:'Indira Gandhi International Airport, Delhi',lat:28.5562,lon:77.1}, BOM:{name:'Chhatrapati Shivaji Maharaj International Airport, Mumbai',lat:19.0896,lon:72.8656}, BLR:{name:'Kempegowda International Airport, Bengaluru',lat:13.1986,lon:77.7066}, MAA:{name:'Chennai International Airport',lat:12.9941,lon:80.1709}, HYD:{name:'Rajiv Gandhi International Airport, Hyderabad',lat:17.2403,lon:78.4294}, CCU:{name:'Netaji Subhas Chandra Bose International Airport, Kolkata',lat:22.6547,lon:88.4467}, GOI:{name:'Goa International Airport',lat:15.3808,lon:73.8314}, AMD:{name:'Sardar Vallabhbhai Patel International Airport, Ahmedabad',lat:23.0734,lon:72.6266}, COK:{name:'Cochin International Airport',lat:10.152,lon:76.4019}, PNQ:{name:'Pune Airport',lat:18.5822,lon:73.9197} };
const cityToAirport = { delhi:'DEL',mumbai:'BOM',bombay:'BOM',chennai:'MAA',madras:'MAA',bengaluru:'BLR',bangalore:'BLR',hyderabad:'HYD',kolkata:'CCU',calcutta:'CCU',ahmedabad:'AMD',goa:'GOI',kochi:'COK',cochin:'COK',pune:'PNQ' };
async function locateAirport(value) { const input=String(value || '').trim(); const bracketCode=input.match(/\(([A-Za-z]{3})\)/)?.[1]?.toUpperCase(); const rawCode=/^[A-Za-z]{3}$/.test(input)?input.toUpperCase():null; const cityCode=cityToAirport[input.toLowerCase().replace(/\s+international airport$/,'')]; const code=bracketCode || rawCode || cityCode; if (code && airports[code]) return {...airports[code],code}; const url = new URL('https://nominatim.openstreetmap.org/search'); url.search = new URLSearchParams({format:'jsonv2',limit:'1',q:`${input} airport, India`}); const response=await fetch(url,{headers:{'User-Agent':'APix-flight-intelligence-local/1.0'}}); if(!response.ok) throw new Error('Map location service unavailable'); const result=(await response.json())[0]; if(!result) throw new Error(`Airport or city “${input}” was not found`); return {name:result.display_name,lat:Number(result.lat),lon:Number(result.lon),code:null}; }
app.get('/api/places', async (req,res) => { const origin=req.query.origin,destination=req.query.destination; if(!origin||!destination) return res.status(400).json({error:'Enter both origin and destination'}); try {const [from,to]=await Promise.all([locateAirport(origin),locateAirport(destination)]);res.json({origin:from,destination:to,points:[[from.lat,from.lon],[to.lat,to.lon]]});}catch(error){res.status(404).json({error:error.message});} });
app.get('/api/flights/search', async (req, res) => { const origin=(req.query.origin || '').toUpperCase(), destination=(req.query.destination || '').toUpperCase(); if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(destination)) return res.status(400).json({error:'Use three-letter IATA airport codes'}); try { const flights=await amadeusOffers(origin,destination); if (!flights.length) return res.status(503).json({error:'No provider result'}); res.json({flights,sources:['Amadeus'],updatedAt:new Date().toISOString()}); } catch (error) { res.status(503).json({error:error.message}); } });
app.get('/api/dashboard', (req,res) => res.json({routes:preview,sources:process.env.AMADEUS_CLIENT_ID?['Amadeus']:['Preview'],updatedAt:new Date().toISOString()}));
app.listen(port, () => console.log(`APix API listening on http://localhost:${port}`));
