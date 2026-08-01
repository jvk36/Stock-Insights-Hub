/**
 * SEC EDGAR 13F fetcher + CUSIP resolver + quarterly refresh scheduler.
 *
 * Strategy: fetch the full EDGAR submission text file
 * (https://www.sec.gov/Archives/edgar/data/{cik}/{accession}.txt)
 * which packages ALL filing documents in one SGML envelope. This avoids
 * the individual per-file CDN paths that are rate-limited on cloud IPs.
 */

import * as cheerio from "cheerio";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hedgeFundsTable,
  sec13fFilingsTable,
  sec13fHoldingsTable,
  cusipTickerMapTable,
} from "@workspace/db";
import { logger } from "./logger";
import YahooFinance from "yahoo-finance2";

const _yf = new YahooFinance();

// US exchange codes used by Yahoo Finance search results
const US_EXCHANGES = new Set(["NYQ", "NMS", "PCX", "NGM", "NCM", "BTS", "NYSEArca"]);

// Hardcoded overrides for CUSIPs whose SEC names are too ambiguous to search reliably
const CUSIP_TICKER_OVERRIDES: Record<string, string> = {
  "060505104": "BAC",   // "BANK AMER/BANK AMERICA CORP" — missing "of" in SEC name
  "H1467J104": "CB",   // "CHUBB LTD SWITZ" — Yahoo returns foreign listings before NYSE
  "023135106": "AMZN", // "AMAZON COM INC" — Yahoo returns AMZN.SN (Chilean) first
  "548661107": "LOW",  // "LOWES COS INC" — Yahoo returns LOWE.VI (Vienna) first
  "G6564A105": "NOMD", // "NOMAD FOODS LTD" — Yahoo returns 0NH.F (Frankfurt) first
  "812215200": "SEG",  // "SEAPORT ENTMT GROUP INC" — 2024 HHH spinoff, not yet searchable
  "093671105": "HRB",  // "BLOCK H & R INC" — Yahoo returns HRB.F (Frankfurt) first
  "225310101": "CACC", // "CREDIT ACCEP CORP MICH" — Yahoo returns 2D5.F (Frankfurt) first
  "44332N106": "HTHT", // "H WORLD GROUP LTD" — Yahoo returns CL4.F (Frankfurt) first
  "M98068105": "WIX",  // "WIX COM LTD" — Israeli company, trades on NASDAQ as WIX
  "G4412G101": "HLF",  // "HERBALIFE NUTRITION LTD" — Yahoo returns HOO.DU (Frankfurt) first; NYSE-listed as HLF until taken private Nov 2023
  "N20146101": "CMPR", // "CIMPRESS N V" — Yahoo misses it; trades on NASDAQ as CMPR
  // ── Yacktman-sourced fixes (also benefit other funds) ────────────────────────
  "30231G102": "XOM",   // "Exxon Mobil Corp." — Yahoo returns XONA.SG (Stuttgart) first
  "65249B208": "NWS",   // "News Corp CL B" — Yahoo returns NC0.SG (Stuttgart) first
  "904767704": "UL",    // "Unilever PLC ADR" — Yahoo returns UNV.SG (Stuttgart) first
  "904784709": "UL",    // "Unilever N.V." — merged with Unilever PLC 2020; same NYSE ADR ticker UL
  "456788108": "INFY",  // "Infosys Ltd ADR" — Yahoo returns I1FO34.SA (Brazil) first
  "464286772": "EWY",   // "iShares MSCI South Korea ETF" — Yahoo returns EPU.SN (Santiago) first
  "12541W209": "CHRW",  // "CH Robinson WW" — Yahoo misses it; NASDAQ CHRW
  "02319V103": "ABEV",  // "Ambev SSA ADR" — Yahoo misses it; NYSE ABEV
  "33767D105": "FCFS",  // "Firstcash Inc." — Yahoo misses it; NASDAQ FCFS
  "78468R663": "BIL",   // "SPDR Bloomberg 1-3 Month T-Bill ETF" — Yahoo misses it; NYSE BIL
  "90130A101": "FOXA",  // "TwentyFirst Cen Fox A" — acquired by Disney Mar 2019; was NASDAQ FOXA
  "90130A200": "FOX",   // "TwentyFirst Cen Fox B" — acquired by Disney Mar 2019; was NASDAQ FOX
  "723787107": "PXD",   // "Pioneer Natural Resources" — acquired by ExxonMobil May 2024; was NYSE PXD
  "487836108": "K",     // "Kellanova" (fka Kellogg) — acquired by Mars Aug 2024; was NYSE K
  "855030102": "SPLS",  // "Staples Inc." — taken private 2017; was NASDAQ SPLS
  "30219G108": "ESRX",  // "Express Scripts" — acquired by Cigna Dec 2018; was NASDAQ ESRX
  "037604105": "APOL",  // "Apollo Education Grp" — taken private Feb 2016; was NASDAQ APOL
  "930059100": "WDR",   // "Waddell & Reed Financial" — acquired by Macquarie Apr 2021; was NYSE WDR
  "594837304": "MFGP",  // "Micro Focus Intl ADR" — acquired by OpenText Jan 2023; was NYSE MFGP
  "754212108": "RAVN",  // "Raven Industries Inc." — acquired by CNH Industrial Feb 2022; was NASDAQ RAVN
  "91336L107": "UNVR",  // "Univar Solutions Inc." — acquired by Apollo Global Jun 2023; was NYSE UNVR
  "74915M100": "QRTEA", // "Qurate Retail Inc." — was NASDAQ QRTEA
  "87236Y108": "AMTD",  // "TD Ameritrade Hldg Corp" — acquired by Charles Schwab Oct 2020; was NASDAQ AMTD
  // ── End Yacktman-sourced fixes ────────────────────────────────────────────────
  // ── Tweedy Browne-sourced fixes (also benefit other funds) ───────────────────
  "66987v109": "NVS",   // "NOVARTIS AG ADR" — Yahoo misses it; NYSE NVS
  "638517102": "NWLI",  // "NATIONAL WESTERN LIFE GROUP" — Yahoo misses it; NASDAQ NWLI
  "N20944109": "CNHI",  // "CNH INDUSTRIAL NV" — Yahoo returns CNHI.VI (Vienna); NYSE CNHI
  "37733W105": "GSK",   // "GLAXO SMITHKLINE PLC ADR" — Yahoo misses it; NYSE GSK (pre-rename)
  "37733W204": "GSK",   // "GSK PLC ADR" — Yahoo misses it; NYSE GSK (post-rename)
  "25243q205": "DEO",   // "DIAGEO PLC ADR" — Yahoo misses it; NYSE DEO
  "01609W102": "BABA",  // "ALIBABA GROUP HOLDING SP-ADR" — Yahoo returns AHLA.DE; NYSE BABA
  "028591105": "ANAT",  // "AMERICAN NATIONAL INSURANCE CO" — acquired by Brookfield May 2022; was NASDAQ ANAT
  "404280406": "HSBC",  // "HSBC HOLDINGS PLC ADR" — Yahoo misses it; NYSE HSBC
  "405552100": "HLN",   // "HALEON PLC ADR" — Yahoo returns H6D.SG (Stuttgart); NYSE HLN (GSK spin-off Jul 2022)
  "207797101": "CTWS",  // "CONNECTICUT WATER SERVICE INC" — acquired by SJW Group Oct 2019; was NASDAQ CTWS
  "780259206": "SHEL",  // "ROYAL DUTCH SHELL PLC-A ADR" — unified to single class Jan 2022; NYSE SHEL
  "89151E109": "TTE",   // "TOTALENERGIES/TOTAL SA ADR" — NYSE TTE (renamed from TOT 2021)
  "89151E959": "TTE",   // "TOTALENERGIES SE ADR" (alt CUSIP) — NYSE TTE
  "89151e909": "TTE",   // "TOTAL SA ADR" (alt CUSIP lowercase) — NYSE TTE
  "F92124100": "TTE",   // "TOTAL SA ADR" (French CUSIP) — NYSE TTE
  "89151E113": "TTE",   // "TOTALENERGIES SE ADR" (another CUSIP variant) — NYSE TTE
  "81211K100": "SEE",   // "SEALED AIR CORPORATION" — Yahoo misses it; NYSE SEE
  "55345k103": "MRC",   // "MRC GLOBAL INC" — Yahoo misses it; NYSE MRC
  "358029106": "FMS",   // "FRESENIUS MEDICAL CARE ADR" — Yahoo misses it; NYSE FMS
  "92937A102": "WPP",   // "WPP PLC ADR" — Yahoo misses it; NASDAQ WPP
  "527288104": "LUK",   // "LEUCADIA NATIONAL CORP" — renamed to Jefferies (JEF) 2018; was NYSE LUK
  "H01301128": "ALC",   // "ALCON INC ADR" — Yahoo misses it; NYSE ALC (Novartis spin-off Apr 2019)
  "Y2990R101": "HAFN",  // "HAFNIA LTD" — Yahoo returns RE0.F (Frankfurt); NYSE HAFN (listed Sep 2023)
  "48268K101": "KT",    // "KT CORP ADR" — Yahoo returns KTC.SG (Stuttgart); NYSE KT
  "82481R106": "SHPG",  // "SHIRE PLC ADR" — acquired by Takeda Jan 2019; was NASDAQ SHPG
  "042735100": "ARW",   // "ARROW ELECTRONICS" — Yahoo misses it; NYSE ARW
  "126650100": "CVS",   // "CVS CORP" — Yahoo misses it; NYSE CVS
  "G89479102": "TRMD",  // "TORM PLC CLASS A" — Yahoo returns TRMD-A.CO (Copenhagen); NASDAQ TRMD
  "Y2106R110": "LPG",   // "DORIAN LPG LIMITED" — Yahoo misses it; NYSE LPG
  "L72967109": "OEC",   // "ORION SA (Orion Engineered Carbons)" — went private Oct 2023; was NYSE OEC
  "828730200": "SFNC",  // "SIMMONS FIRST NATIONAL CORP" — Yahoo misses it; NASDAQ SFNC
  "01973R101": "ALSN",  // "ALLISON TRANSMISSION HLD" — Yahoo returns 1A7.MU (Munich); NYSE ALSN
  "74319N100": "ACDC",  // "PROFRAC HOLDINGS A" — Yahoo misses it; NASDAQ ACDC
  "731105201": "PSNY",  // "POLESTAR AUTOMOTIVE CL A" — Yahoo misses it; NASDAQ PSNY
  "07177M103": "BXLT",  // "BAXALTA INC" — acquired by Shire Jun 2016; was NYSE BXLT
  "125523100": "CI",    // "CIGNA CORP" — Yahoo returns CGN.MU (Munich); NYSE CI
  "57636q104": "MA",    // "MASTERCARD INC CLASS A" — Yahoo misses it; NYSE MA
  "811065101": "SNI",   // "SCRIPPS NETWORKS INTERACTIVE" — acquired by Discovery Mar 2018; was NASDAQ SNI
  // ── End Tweedy Browne-sourced fixes ──────────────────────────────────────────
  // ── Davis Selected Advisers-sourced fixes (also benefit other funds) ─────────
  // Q1 2026 Yahoo CUSIP collisions — multiple CUSIPs wrongly resolved to QBTS
  "127097103": "CTRA",  // "Coterra Energy" — Yahoo returns QBTS (D-Wave collision)
  "20369C106": "CHCT",  // "Community Healthcare Trust" — Yahoo returns QBTS
  "444097406": "HPP",   // "Hudson Pacific Properties" — Yahoo returns QBTS
  "867892101": "SHO",   // "Sunstone Hotel Investors" — Yahoo returns QBTS
  "084670108": "BRK-A", // "Berkshire Hathaway Class A" — Yahoo maps both BRK CUSIPs to BRK-B
  // Active stocks, wrong exchange
  "878742204": "TECK",  // "Teck Resources Class B" — Yahoo returns TECK-B.TO (Toronto); NYSE TECK
  "66987V109": "NVS",   // "Novartis AG ADR" (uppercase-V CUSIP variant of 66987v109) — NYSE NVS
  "44891N208": "IAC",   // "IAC Inc." — Yahoo returns 4LRA.MU (Munich); NASDAQ IAC
  "44891N109": "IAC",   // "IAC/InterActiveCorp" (older CUSIP) — Yahoo returns 0J7Q.L (London)
  "464287408": "IVE",   // "iShares S&P 500 Value ETF" — Yahoo returns IVECL.SN (Santiago)
  "03748R101": "AIV",   // "Apartment Investment & Management (Aimco)" — Yahoo returns AIV.SG (Stuttgart)
  "52603A109": "LC",    // "LendingClub Corp." — Yahoo returns 8LCA.DU (Düsseldorf); NYSE LC
  "64110W102": "NTES",  // "NetEase Inc. ADR" — Yahoo returns NEH.SG (Stuttgart); NASDAQ NTES
  "98426T106": "YY",    // "YY Group ADR" — Yahoo returns 300304.SZ (Shenzhen); NASDAQ YY
  "531229771": "FWONA", // "Liberty Formula One Series A" — Yahoo returns LM0F.SG (Stuttgart)
  "531229870": "LSXMA", // "Liberty Media Corp. Series A" — Yahoo returns LM0F.SG (Stuttgart)
  "89055F103": "BLD",   // "TopBuild Corp." — Yahoo returns 28T.DU (Düsseldorf); NYSE BLD
  "929740108": "WAB",   // "Wabtec Corp." — Yahoo returns W1AB34.SA (Brazil); NYSE WAB
  "60500F105": "MF",    // "Missfresh Ltd. ADS" — Yahoo returns X3C.F (Frankfurt); NASDAQ MF (delisted 2022)
  "836034108": "SFUN",  // "SouFun/Fang Holdings ADR" — Yahoo misses it; NYSE SFUN
  // Active stocks, Yahoo just misses them
  "76131N101": "ROIC",  // "Retail Opportunity Investments Corp." — NASDAQ ROIC
  "23908L207": "DUSA",  // "Davis Select U.S. Equity ETF" — NASDAQ DUSA
  "23908L108": "DFNL",  // "Davis Select Financial ETF" — NASDAQ DFNL
  "23908L306": "DWLD",  // "Davis Select Worldwide ETF" — NASDAQ DWLD
  "23908L405": "DINT",  // "Davis Select International ETF" — NASDAQ DINT
  "G3421J106": "FERG",  // "Ferguson PLC" — NYSE FERG (UK plc, dual-listed)
  "G5480U120": "LBTYK", // "Liberty Global PLC Series C" — NASDAQ LBTYK
  "037411105": "APA",   // "Apache Corporation" — NASDAQ APA
  "647581107": "EDU",   // "New Oriental Education ADR" — NYSE EDU
  "45104G104": "IBN",   // "ICICI Bank Limited ADR" — NYSE IBN
  "02665T306": "AMH",   // "American Homes 4 Rent Class A" — NYSE AMH
  "26885B100": "EQM",   // "EQT Midstream Partners" — merged into Equitrans 2020; was NYSE EQM
  "803054204": "SAP",   // "SAP SE ADR" — NYSE SAP (already may exist via Tweedy; harmless dup)
  "G5480U153": "LILAK", // "Liberty Global LiLAC Class C" — NASDAQ LILAK
  "48248M102": "KKR",   // "KKR & Co. L.P." — NYSE KKR
  "464287689": "IWV",   // "iShares Russell 3000 ETF" — NYSE ARCA IWV
  "464287622": "IWB",   // "iShares Russell 1000 Index Fund" — NYSE ARCA IWB
  "G27823106": "DLPH",  // "Delphi Automotive PLC" — split 2017 into Aptiv+DLPH; was NYSE DLPH
  "G2709G107": "DLPH",  // "Delphi Technologies PLC" — acquired by BorgWarner 2020; was NYSE DLPH
  "53071M856": "LVNTA", // "Liberty Interactive/Ventures Series A" — was NASDAQ LVNTA
  "53071M880": "LVNTA", // "Liberty Ventures Series A" — was NASDAQ LVNTA
  "09253U108": "BX",    // "The Blackstone Group L.P." — NYSE BX
  "531172104": "LPT",   // "Liberty Property Trust" — acquired by Prologis Feb 2020; was NYSE LPT
  "50540R409": "LH",    // "Laboratory Corporation of America Hldg" — NYSE LH
  "096627104": "BWP",   // "Boardwalk Pipeline Partners" — taken private Nov 2018; was NYSE BWP
  // Delisted / acquired
  "913017109": "UTX",   // "United Technologies Corp." — merged with Raytheon Apr 2020; was NYSE UTX
  "017175100": "Y",     // "Alleghany Corporation" — acquired by Berkshire Oct 2022; was NYSE Y
  "292505104": "ECA",   // "Encana Corporation" — renamed Ovintiv Jan 2020; was NYSE ECA
  "21870Q105": "COR",   // "CoreSite Realty Corp." — acquired by American Tower Jan 2022; was NYSE COR
  "23283R100": "CONE",  // "CyrusOne Inc." — acquired by KKR/GIP Mar 2022; was NASDAQ CONE
  "00817Y108": "AET",   // "Aetna Inc." — acquired by CVS Health Nov 2018; was NYSE AET
  "N47279109": "INXN",  // "InterXion Holding NV" — acquired by Digital Realty Mar 2020; was NYSE INXN
  "61166W101": "MON",   // "Monsanto Co." — acquired by Bayer Jun 2018; was NYSE MON
  "23317H102": "DDR",   // "DDR Corporation" — renamed RVI 2018, delisted; was NYSE DDR
  "751452202": "RPT",   // "Ramco-Gershenson / RPT Realty" — acquired by Kimco Oct 2022; was NYSE RPT
  "48138L107": "JMEI",  // "Jumei International ADR" — went private 2020; was NYSE JMEI
  "91911K102": "VRX",   // "Valeant Pharmaceuticals" — renamed Bausch Health 2018; was NYSE VRX
  "531465102": "LTRPA", // "Liberty TripAdvisor Holdings Series A" — acquired/delisted Apr 2024; was NASDAQ LTRPA
  "G91442106": "TYC",   // "Tyco International PLC" — merged with Johnson Controls Sep 2016; was NYSE TYC
  "264411505": "DRE",   // "Duke Realty Corp." — acquired by Prologis Oct 2022; was NYSE DRE
  "755111507": "RTN",   // "Raytheon Co." — merged with United Technologies Apr 2020; was NYSE RTN
  "471109108": "JAH",   // "Jarden Corp." — acquired by Newell Brands Apr 2016; was NYSE JAH
  "966837106": "WFM",   // "Whole Foods Market" — acquired by Amazon Aug 2017; was NASDAQ WFM
  "N51488117": "MBLY",  // "Mobileye N.V." — acquired by Intel Aug 2017; was NYSE MBLY
  "517942108": "LHO",   // "LaSalle Hotel Properties" — acquired by Pebblebrook Nov 2018; was NYSE LHO
  // ── End Davis Selected Advisers-sourced fixes ─────────────────────────────────
  // ── Abrams Capital Management-sourced fixes ───────────────────────────────────
  // Active stocks, wrong exchange
  "G96629103": "WTW",   // "Willis Towers Watson PLC" — Yahoo returns WTY.F (Frankfurt); NASDAQ WTW
  "67103H107": "ORLY",  // "O'Reilly Automotive Inc. New" — Yahoo returns ORLY.VI (Vienna); NASDAQ ORLY
  // Active stocks, Yahoo misses them
  "536797103": "LAD",   // "Lithia Motors Inc." — NYSE LAD
  "138103106": "CTLP",  // "Cantaloupe Inc." (formerly USA Technologies) — NASDAQ CTLP
  "92719A106": "VEON",  // "VimpelCom Ltd." / VEON — renamed 2017; NASDAQ VEON
  "14575E105": "CARS",  // "Cars.com Inc." — NYSE CARS
  // Delisted / acquired
  "37951D102": "ENT",   // "Global Eagle Entertainment" — bankrupt/delisted Aug 2020; was NASDAQ ENT
  "67551U105": "OZM",   // "Och-Ziff Capital Management Group" — renamed Sculptor 2019, acq Rithm 2023; was NYSE OZM
  "67551U204": "OZM",   // "Och-Ziff Capital Management Group" (alt CUSIP) — NYSE OZM
  "811246107": "SCU",   // "Sculptor Capital Management" — acquired by Rithm Nov 2023; was NYSE SCU
  "492515101": "KERX",  // "Keryx Biopharmaceuticals Inc." — acquired by Akebia Dec 2018; was NASDAQ KERX
  "L7257P205": "PACD",  // "Pacific Drilling SA" — bankrupt/delisted 2020; was NYSE PACD
  "15912K100": "CHNG",  // "Change Healthcare Inc." — acquired by UnitedHealth Oct 2022; was NASDAQ CHNG
  "747545101": "QCP",   // "Quality Care Properties Inc." — merged with Welltower Jan 2017; was NYSE QCP
  "021346101": "AABA",  // "Altaba Inc." (Yahoo Inc. remnant) — liquidated/delisted Sep 2019; was NASDAQ AABA
  "067774109": "BKS",   // "Barnes & Noble Inc." — acquired by Elliott Aug 2019; was NYSE BKS
  "887317303": "TWX",   // "Time Warner Inc." — acquired by AT&T Jun 2018; was NYSE TWX
  "60935Y208": "MGI",   // "MoneyGram International Inc." — went private 2023; was NASDAQ MGI
  "19625W104": "CLNS",  // "Colony NorthStar Inc." — became Colony Capital/DigitalBridge; was NYSE CLNS
  "563568104": "WBT",   // "Manitowoc Foodservice Inc." (became Welbilt) — acquired by Ali Group 2022; was NYSE WBT
  "949090104": "WBT",   // "Welbilt Inc." — acquired by Ali Group 2022; was NYSE WBT
  "66705Y104": "NSAM",  // "NorthStar Asset Management Group" — merged into Colony NorthStar Jan 2017; was NYSE NSAM
  "66704R803": "NRF",   // "NorthStar Realty Finance Corp." — merged into Colony NorthStar Jan 2017; was NYSE NRF
  "684000102": "OPB",   // "Opus Bank" — acquired by Pacific Premier Nov 2020; was NASDAQ OPB
  "151020104": "CELG",  // "Celgene Corp." — acquired by Bristol-Myers Squibb Nov 2019; was NASDAQ CELG
  "87244T109": "TICC",  // "TICC Capital Corp." — renamed Oxford Square Capital (OXSQ) 2018; was NASDAQ TICC
  "G0177J108": "AGN",   // "Allergan PLC" — acquired by AbbVie May 2020; was NYSE AGN
  "G46188101": "HZNP",  // "Horizon Therapeutics Public Ltd." — acquired by Amgen Oct 2023; was NASDAQ HZNP
  "90328S500": "USAT",  // "USA Technologies Inc." — renamed Cantaloupe (CTLP) 2021; was NASDAQ USAT
  "87160A100": "SYT",   // "Syngenta AG ADR" — acquired by ChemChina Jun 2017; was NYSE SYT
  // ── End Abrams Capital Management-sourced fixes ────────────────────────────────
  // ── Baupost Group-sourced fixes ───────────────────────────────────────────────
  // Active stocks, wrong exchange
  "03073E105": "ABC",   // "AmerisourceBergen Corp" (now Cencora COR) — Yahoo returns ABC.VI (Vienna); NYSE ABC
  "69002R103": "OB",    // "Outbrain Inc." — Yahoo returns 852.SG (Stuttgart); NASDAQ OB
  "36165L108": "GDS",   // "GDS Holdings Ltd ADR" — Yahoo returns G40.F (Frankfurt); NASDAQ GDS
  "02156K103": "ATUS",  // "Altice USA Inc." — Yahoo returns 15PA.DU (Düsseldorf); NYSE ATUS
  "983793100": "XPO",   // "XPO Logistics Inc." — Yahoo returns UX2A.MU (Munich); NYSE XPO
  "668771108": "GEN",   // "NortonLifeLock/Gen Digital" — Yahoo returns SYM.HM (Hamburg); NASDAQ GEN
  "G0190X100": "AJAX",  // "Ajax Financial Acquisitions Corp" — Yahoo returns AJAXENGG.BO (Bombay); was NYSE AJAX
  "G0190X126": "AJAX",  // "Ajax I" (alt CUSIP) — Yahoo returns AJAXENGG.BO
  "G0190X118": "AJAX",  // "Ajax I" (alt CUSIP) — Yahoo returns AJAXENGG.BO
  // Active/renamed stocks, Yahoo misses them
  "G5480U104": "LBTYA", // "Liberty Global PLC Class A" — NASDAQ LBTYA
  "699374302": "PRTK",  // "Paratek Pharmaceuticals Inc." — NASDAQ PRTK
  "31620M106": "FIS",   // "Fidelity National Information Services" — NYSE FIS
  "92343X100": "VRNT",  // "Verint Systems Inc." — NASDAQ VRNT
  "26969P108": "EXP",   // "Eagle Materials Inc." — NYSE EXP
  "230031106": "CGEM",  // "Cullinan Oncology Inc." — NASDAQ CGEM
  "829226109": "SBGI",  // "Sinclair Broadcast Group Inc." — NASDAQ SBGI
  "92837L109": "VIST",  // "Vista Oil & Gas / Vista Energy" — NYSE VIST
  "G7997R103": "STX",   // "Seagate Technology Holdings PLC" — NASDAQ STX
  "G2110R114": "IMOS",  // "ChipMOS Technologies (Bermuda) Ltd ADR" — NASDAQ IMOS
  "88331L116": "SKIN",  // "The Beauty Health Company" — NASDAQ SKIN
  "971378104": "WSC",   // "WillScot Mobile Mini Holdings Corp" — NASDAQ WSC
  "84860W102": "SRC",   // "Spirit Realty Capital" — acquired by Realty Income Jan 2024; was NYSE SRC
  "29332G102": "EHAB",  // "Enhabit Inc." (spun from Encompass Health Jul 2022) — NYSE EHAB
  "66988K102": "TMQ",   // "NovaCopper Inc. / Trilogy Metals" — NYSE American TMQ
  "531229706": "LMCA",  // "Liberty Media Corp Delaware Series A" — NASDAQ LMCA
  "531229888": "LMCA",  // "Liberty Media Corp Delaware Series A" (alt CUSIP) — NASDAQ LMCA
  // SPACs with meaningful quarter-counts
  "71531R117": "PSTH",  // "Pershing Square Tontine Holdings" — liquidated 2022; was NYSE PSTH
  "71531R109": "PSTH",  // "Pershing Square Tontine Holdings" (warrants CUSIP) — NYSE PSTH
  "G7417R113": "RBAQ",  // "RedBall Acquisition Corp" — failed SPAC; was NYSE RBAQ
  "G7417R121": "RBAQ",  // "RedBall Acquisition Corp" (alt CUSIP) — NYSE RBAQ
  "53073L112": "LMACA", // "Liberty Media Acquisition Corp" — SPAC; was NASDAQ LMACA
  "53073L104": "LMACA", // "Liberty Media Acquisition Corp" (alt CUSIP) — NASDAQ LMACA
  "G8601L128": "SVF",   // "SVF Investment Corp" (SoftBank SPAC) — was NYSE SVF
  "G46044114": "HZAC",  // "Horizon Acquisition Corporation" — SPAC; was NASDAQ HZAC
  // Delisted / acquired / bankrupt
  "923454102": "VRTV",  // "Veritiv Corp" — went private Dec 2022; was NYSE VRTV
  "89374L104": "TBIO",  // "Translate Bio Inc." — acquired by Sanofi Sep 2021; was NASDAQ TBIO
  "19626G108": "CLNY",  // "Colony Capital Inc. New" — became DigitalBridge (DBRG); was NYSE CLNY
  "19624R106": "CLNY",  // "Colony Capital Inc." (old CUSIP) — was NYSE CLNY
  "34986J105": "FWP",   // "Forward Pharma A/S" — acquired by Biogen Feb 2017; was NASDAQ FWP
  "686164302": "OREX",  // "Orexigen Therapeutics Inc." — bankrupt May 2018; was NASDAQ OREX
  "686164104": "OREX",  // "Orexigen Therapeutics Inc." (alt CUSIP) — was NASDAQ OREX
  "M5R75Y101": "IS",    // "IronSource Ltd" — merged with Unity Software Nov 2022; was NYSE IS
  "03940F103": "LFG",   // "Archaea Energy Inc." — acquired by BP Dec 2022; was NYSE LFG
  "14740B606": "CASC",  // "Cascadian Therapeutics Inc." — acquired by Seagen 2018; was NASDAQ CASC
  "14740B101": "CASC",  // "Cascadian Therapeutics Inc." (alt CUSIP) — was NASDAQ CASC
  "15136A102": "CDEV",  // "Centennial Resource Dev." — merged into Permian Resources 2022; was NASDAQ CDEV
  "124857202": "CBS",   // "CBS Corp New" — merged with Viacom 2019; was NYSE CBS
  "494577109": "KIN",   // "Kindred Biosciences Inc." — acquired by Elanco Sep 2021; was NASDAQ KIN
  "482539103": "KLXI",  // "KLX Inc." — acquired by Boeing 2018; was NASDAQ KLXI
  "82028K200": "SJR",   // "Shaw Communications Inc." — acquired by Rogers Apr 2023; was NYSE SJR
  "896047503": "TRCO",  // "Tribune Media Co." — acquired by Nexstar Dec 2019; was NASDAQ TRCO
  "268648102": "EMC",   // "EMC Corp Massachusetts" — acquired by Dell Sep 2016; was NYSE EMC
  "67020Y100": "NUAN",  // "Nuance Communications Inc." — acquired by Microsoft Mar 2022; was NASDAQ NUAN
  "65342H110": "NXEO",  // "Nexeo Solutions Inc." — acquired by Univar 2019; was NASDAQ NXEO
  "Y8213L102": "SEMI",  // "SunEdison Semiconductor Ltd" — acquired by GlobalWafers Jan 2017; was NASDAQ SEMI
  "848574109": "SPR",   // "Spirit AeroSystems Holdings Inc." — NYSE SPR
  "28470R102": "ERI",   // "Eldorado Resorts Inc." — merged with Caesars Jul 2020; was NASDAQ ERI
  "676220106": "ODP",   // "Office Depot Inc." — now ODP Corporation; NASDAQ ODP
  "88883P101": "TBRA",  // "Tobira Therapeutics Inc." — acquired by Allergan Oct 2016; was NASDAQ TBRA
  "580037703": "MDR",   // "McDermott International Inc." — bankrupt Jan 2020; was NYSE MDR
  "50420D108": "LQ",    // "La Quinta Holdings Inc." — acquired by Wyndham May 2018; was NYSE LQ
  "40054J109": "GRPAF", // "Grupo Aeromexico SAB de CV ADR" — OTC GRPAF
  "078314101": "BXE",   // "Bellatrix Exploration Ltd" — bankrupt 2019; was NYSE BXE
  // SPACs — less common, 1–9 quarters each
  "78516C114": "SCAQ",  // "Saban Capital Acquisition Corp" SPAC — was NASDAQ SCAQ
  "78516C205": "SCAQ",  // "Saban Capital Acquisition Corp" (warrants)
  "G4182A110": "GTYH",  // "GTY Technology Holdings Inc." — went private; was NASDAQ GTYH
  "G4182A128": "GTYH",  // "GTY Technology Holdings" (alt CUSIP)
  "362409112": "GTYH",  // "GTY Technology Holdings" (alt CUSIP)
  "G0371B109": "AGCB",  // "Altimeter Growth Corp 2" SPAC — was NYSE AGCB
  "G28315102": "DRGNU", // "Dragoneer Growth Opt Corp II" SPAC — was NASDAQ DRGNU
  "G28314105": "DRGN",  // "Dragoneer Growth Opp Corp" SPAC — was NASDAQ DRGN
  "212894117": "CNVS",  // "Conyers Park Acquisition Corp" — merged with Simply Good Foods; was NASDAQ CNVS
  "G8062D128": "STNL",  // "Sentinel Energy Services Inc." SPAC — was NASDAQ STNL
  "81728P204": "STNL",  // "Sentinel Energy Services" (warrants)
  "G1739V126": "BSTN",  // "Broadstone Acquisition Corp" SPAC — was NYSE BSTN
  "G1739V118": "BSTN",  // "Broadstone Acquisition Corp" (alt CUSIP)
  "G46044122": "HZON",  // "Horizon Acquisition Corp II" SPAC — was NASDAQ HZON
  "82811P119": "SRAQ",  // "Silver Run Acquisition Corp II" — merged with Alta Mesa; was NASDAQ SRAQ
  "82811P200": "SRAQ",  // "Silver Run Acquisition Corp II" (warrants)
  "82812A103": "SRAQU", // "Silver Run Acquisition Corp" — merged with Centennial Resource Dev; was NASDAQ SRAQU
  "82812A202": "SRAQU", // "Silver Run Acquisition Corp" (warrants)
  "G7484L122": "RTP",   // "Reinvent Technology Partners" SPAC — was NASDAQ RTP
  "G7483N103": "RTPY",  // "Reinvent Technology Partners Y" SPAC — was NASDAQ RTPY
  "G7483N111": "RTPY",  // "Reinvent Technology Partners Y" (warrants)
  "G74847123": "RTPZ",  // "Reinvent Technology Partners Z" SPAC — was NASDAQ RTPZ
  "92538T112": "VSPR",  // "Vesper Healthcare Acquisition Corp" SPAC — was NASDAQ VSPR
  "92538T203": "VSPR",  // "Vesper Healthcare Acquisition Corp" (warrants)
  "G4771L113": "IIAC",  // "Investindustrial Acquisition Corp" SPAC — was NASDAQ IIAC
  "G4771L121": "IIAC",  // "Investindustrial Acquisition Corp" (warrants)
  "G0682V125": "AVAN",  // "Avanti Acquisition Corp" SPAC — was NASDAQ AVAN
  "G0682V117": "AVAN",  // "Avanti Acquisition Corp" (alt CUSIP)
  "737446104": "PSPC",  // "Post Holdings Partnering Corp" SPAC — was NYSE PSPC
  "09074D103": "BTTHF", // "Biotie Therapies OYJ" — acquired by Acorda 2016; was OTC BTTHF
  "G88272102": "TBA",   // "Thoma Bravo Advantage" SPAC — was NYSE TBA
  // ── End Baupost Group-sourced fixes ──────────────────────────────────────────
  // ── Generation Investment Management-sourced fixes ────────────────────────────
  "81141R100": "SE",    // "Sea Ltd" — Yahoo returns IPVV (wrong); NYSE SE
  // Wrong exchange (Yahoo returns European listing)
  "075887109": "BDX",   // "Becton Dickinson & Co" — Yahoo returns BOX.F (Frankfurt); NYSE BDX
  "G47791101": "TT",    // "Ingersoll-Rand PLC" — became Trane Technologies in 2020; NYSE TT
  "H84989104": "TEL",   // "TE Connectivity Ltd" — Yahoo misses Swiss/Irish CUSIP; NYSE TEL
  "G1151C101": "ACN",   // "Accenture PLC Ireland" — Yahoo misses Irish CUSIP; NYSE ACN
  // Active stocks Yahoo misses
  "955306105": "WST",   // "West Pharmaceutical Services Inc" — NYSE WST
  "74144T108": "TROW",  // "T. Rowe Price Group Inc" — NASDAQ TROW
  "257651109": "DCI",   // "Donaldson Company Inc" — NYSE DCI
  "45168D104": "IDXX",  // "IDEXX Laboratories Inc" — NASDAQ IDXX
  // Acquired / delisted
  "156782104": "CERN",  // "Cerner Corp" — acquired by Oracle Jun 2022; was NASDAQ CERN
  "858912108": "SRCL",  // "Stericycle Inc" — acquired by Waste Management Nov 2023; was NASDAQ SRCL
  "92220P105": "VAR",   // "Varian Medical Systems" — acquired by Siemens Healthineers Apr 2021; was NYSE VAR
  "74374T109": "PTRA",  // "Proterra Inc" — bankrupt Aug 2023; was NASDAQ PTRA
  "636518102": "NATI",  // "National Instruments Corp" — acquired by Emerson Electric Oct 2023; was NASDAQ NATI
  "91843L103": "VWR",   // "VWR Corp" — acquired by Avantor Nov 2017; was NASDAQ VWR
  "003654100": "ABMD",  // "Abiomed Inc" — acquired by Johnson & Johnson Dec 2022; was NASDAQ ABMD
  "535678106": "LLTC",  // "Linear Technology Corp" — acquired by Analog Devices Mar 2017; was NASDAQ LLTC
  "53578A108": "LNKD",  // "LinkedIn Corp" — acquired by Microsoft Dec 2016; was NYSE LNKD
  "22304C100": "CVET",  // "Covetrus Inc" — acquired by private equity Sep 2022; was NASDAQ CVET
  "68375Y109": "OPWR",  // "Opower Inc" — acquired by Oracle Jun 2016; was NYSE OPWR
  "582839106": "MJN",   // "Mead Johnson Nutrition Co" — acquired by Reckitt Benckiser 2017; was NYSE MJN
  "625207105": "MULE",  // "MuleSoft Inc" — acquired by Salesforce May 2018; was NYSE MULE
  "83416T100": "SCTY",  // "SolarCity Corp" — acquired by Tesla Nov 2016; was NASDAQ SCTY
  // ── End Generation Investment Management-sourced fixes ───────────────────────
  // ── Akre Capital Management-sourced fixes ────────────────────────────────────
  // Active stocks Yahoo misses
  "011642105": "ALRM", // "Alarm.com Holdings Inc" — NASDAQ ALRM
  "48251w104": "KKR",  // "KKR & Co L P Del" — NYSE KKR
  "25264R207": "DHIL", // "Diamond Hill Investment Group" — NASDAQ DHIL
  "90347A100": "UI",   // "Ubiquiti Networks Inc" — NYSE UI
  "12510Q100": "CCCS", // "CCC Intelligent Solutions Holdings" — NASDAQ CCCS
  "113004105": "BAM",  // "Brookfield Asset Management Ltd" — NYSE BAM
  // Wrong exchange (Yahoo returns European listing)
  "610236101": "MNRO", // "Monro Muffler Brake Inc" — Yahoo returns MR2.SG (Frankfurt); NASDAQ MNRO
  // Acquired / delisted
  "74165N105": "PRMW", // "Primo Water Corp" — taken private Dec 2023; was NASDAQ PRMW
  "74167P108": "PRMW", // "Primo Water Corporation" (redomicile CUSIP) — same company
  "92936P100": "WMIH", // "WMIH Corp" — acquired by Nationstar Jan 2018; was NASDAQ WMIH
  "194014106": "ENOV", // "Colfax Corp" — renamed to Enovis Corp Apr 2022; NYSE ENOV
  "34417P100": "FOCS", // "Focus Financial Partners Inc" — taken private 2023; was NASDAQ FOCS
  "041356205": "AAIC", // "Arlington Asset Investment Corp" — NYSE AAIC
  "G16169107": "BNRE", // "Brookfield Asset Mgmt Reinsurance Partners" — NYSE BNRE
  // ── End Akre Capital Management-sourced fixes ─────────────────────────────────
  // ── Appaloosa LP-sourced fixes ────────────────────────────────────────────────
  // Active stocks Yahoo misses
  "382550101": "GT",    // "Goodyear Tire & Rubber Co" — NASDAQ GT
  "86614U100": "SUM",   // "Summit Materials Inc" — NYSE SUM
  "845467109": "SWN",   // "Southwestern Energy Co" — NYSE SWN
  "200340107": "CMA",   // "Comerica Inc" — NYSE CMA
  "499049104": "KNX",   // "Knight-Swift Transportation Holdings" — NYSE KNX
  "655664100": "JWN",   // "Nordstrom Inc" — NYSE JWN
  "655844108": "NSC",   // "Norfolk Southern Corp" — NYSE NSC
  "896818101": "TGI",   // "Triumph Group Inc" — NYSE TGI
  "344849104": "FL",    // "Foot Locker Inc" — NYSE FL
  "486606106": "KYN",   // "Kayne Anderson MLP/Midstream Investment" — NYSE KYN
  "62482R107": "COOP",  // "Mr. Cooper Group Inc" — NASDAQ COOP
  "73935A104": "QQQ",   // "Invesco QQQ Trust" — NASDAQ QQQ
  "912909108": "X",     // "United States Steel Corp" — NYSE X
  "184692101": "CEM",   // "ClearBridge MLP & Midstream Fund" — NYSE CEM
  "03938L104": "MT",    // "ArcelorMittal SA" — NYSE MT
  "G0751N103": "AY",    // "Atlantica Yield PLC" — NASDAQ AY
  // Wrong exchange (Yahoo returns foreign listing)
  "12769G100": "CZR",   // "Caesars Entertainment Inc" — Yahoo returns CZR1.MX (Mexico); NASDAQ CZR
  "127686103": "CZR",   // "Caesars Entertainment Corp" (pre-restructuring CUSIP) — NASDAQ CZR
  "745867101": "PHM",   // "PulteGroup Inc" — Yahoo returns PU7.F (Frankfurt); NYSE PHM
  "969457100": "WMB",   // "Williams Companies Inc" — Yahoo returns WMB.VI (Vienna); NYSE WMB
  "165167180": "CHK",   // "Chesapeake Energy Corp" (post-bankruptcy CUSIP) — Yahoo returns Stuttgart; NASDAQ CHK
  "165167107": "CHK",   // "Chesapeake Energy Corp" (pre-bankruptcy CUSIP) — NASDAQ CHK
  "464287184": "EPU",   // "iShares MSCI All Peru ETF" — Yahoo returns EPU.SN (Santiago); NYSE Arca EPU
  "464287556": "EPU",   // "iShares MSCI All Peru ETF" (alt CUSIP) — NYSE Arca EPU
  "464287234": "EPU",   // "iShares MSCI All Peru ETF" (alt CUSIP) — NYSE Arca EPU
  "500767306": "KWEB",  // "KraneShares CSI China Internet ETF" — Yahoo returns KWEB.SN (Santiago); NYSE Arca KWEB
  "81369Y506": "XLI",   // "Industrial Select Sector SPDR" — Yahoo returns XLYD.BA (Buenos Aires); NYSE Arca XLI
  "81369Y886": "XLC",   // "Communication Services Select Sector SPDR" — Yahoo returns XLYD.BA; NYSE Arca XLC
  "81369Y605": "XLK",   // "Technology Select Sector SPDR" — Yahoo returns XLYD.BA; NYSE Arca XLK
  "81369Y209": "XLF",   // "Financial Select Sector SPDR" — Yahoo returns XLYD.BA; NYSE Arca XLF
  "00214Q104": "ARKK",  // "ARK Innovation ETF" — Yahoo returns ARKK.BA (Buenos Aires); NYSE Arca ARKK
  "92189F676": "GDX",   // "VanEck Gold Miners ETF" — Yahoo returns GDXCL.SN (Santiago); NYSE Arca GDX
  // ALPS ETFs
  "00162Q866": "AMLP",  // "ALPS Alerian MLP ETF" — NYSE Arca AMLP
  "00162Q452": "ENFR",  // "Alerian Energy Infrastructure ETF" — NYSE Arca ENFR
  // Acquired / delisted
  "96949L105": "WPZ",   // "Williams Partners LP" — merged into Williams Companies 2018; was NYSE WPZ
  "88104R100": "TERP",  // "TerraForm Power Inc" — acquired by Brookfield Renewable 2020; was NASDAQ TERP
  "88104R209": "TERP",  // "TerraForm Power Inc" (alt CUSIP) — was NASDAQ TERP
  "90184L102": "TWTR",  // "Twitter Inc" — taken private Oct 2022; was NYSE TWTR
  "29278N103": "ETP",   // "Energy Transfer Partners LP" — merged into ET 2018; was NYSE ETP
  "29273R109": "ETP",   // "Energy Transfer Partners LP" (alt CUSIP) — was NYSE ETP
  "88104M101": "GLBL",  // "TerraForm Global Inc" — acquired by SunEdison 2017; was NASDAQ GLBL
  "G9329Z100": "VNTR",  // "Venator Materials PLC" — filed bankruptcy Dec 2023; was NYSE VNTR
  "29788T103": "ETWO",  // "E2open Parent Holdings Inc" — went private 2024; was NYSE ETWO
  "292480100": "ENBL",  // "Enable Midstream Partners LP" — acquired by Energy Transfer 2021; was NYSE ENBL
  "L5140P101": "I",     // "Intelsat SA" — filed bankruptcy 2020; last known NYSE I
  "984332106": "YHOO",  // "Yahoo Inc" — acquired by Verizon/Oath 2017; was NASDAQ YHOO
  "00771V108": "AERI",  // "Aerie Pharmaceuticals Inc" — acquired by Alcon 2022; was NASDAQ AERI
  "N59465109": "MYL",   // "Mylan NV" — merged into Viatris 2020; was NASDAQ MYL
  "780259107": "SHEL",  // "Royal Dutch Shell PLC" — unified as Shell PLC (SHEL) 2022; NYSE SHEL
  "871503108": "GEN",   // "Symantec Corp" — became NortonLifeLock (NLOK), then Gen Digital (GEN); NASDAQ GEN
  "G00349103": "AY",    // "Abengoa Yield PLC" — renamed Atlantica Yield; NASDAQ AY
  "001547108": "AKS",   // "AK Steel Holding Corp" — acquired by Cleveland-Cliffs 2020; was NYSE AKS
  "039380407": "ARCH",  // "Arch Coal Inc" — emerged from bankruptcy as Arch Resources 2016; NYSE ARCH
  "559080106": "MMP",   // "Magellan Midstream Partners LP" — acquired by ONEOK 2023; was NYSE MMP
  "708160106": "JCP",   // "JCPenney" — filed bankruptcy 2020; was NYSE JCP
  "74909E106": "QHC",   // "Quorum Health Corp" — filed bankruptcy 2020; was NYSE QHC
  "Y8565J101": "TOO",   // "Teekay Offshore Partners LP" — privatized by Brookfield 2019; was NYSE TOO
  "72766Q105": "PAH",   // "Platform Specialty Products Corp" — renamed Element Solutions (ESI) 2019; was NYSE PAH
  // General Motors alternate share classes
  "37045V126": "GM",    // "General Motors Co" (alt class CUSIP) — NYSE GM
  "37045V118": "GM",    // "General Motors Co" (alt class CUSIP) — NYSE GM
  // SPACs
  "G8704C124": "TCVA",  // "TCV Acquisition Corp" SPAC — was NYSE TCVA
  "G1992N118": "PRPB",  // "CC Neuberger Principal Holdings III" SPAC — was NYSE PRPB
  "42589T206": "HCIV",  // "Hennessy Capital Investment Corp V" SPAC — was NYSE HCIV
  "53073L203": "LMAC",  // "Liberty Media Acquisition Corp" SPAC — was NASDAQ LMAC
  "G8601L110": "SVFC",  // "SVF Investment Corp 3" (SoftBank SPAC) — was NYSE SVFC
  // ETF price-matched identifications (generic filing names; identified by implied share price)
  "78468R556": "XOP",  // SPDR Oil & Gas Exploration ETF — $58.50 Q4 2020→$81.34 Q1 2021 matches XOP energy rally
  "78464A730": "MLPB", // SPDR S&P MLP ETF — $35.22 Q1 2018→$22.36 Q3 2019 matches MLP selloff period
  "78464A870": "XSD",  // SPDR S&P Semiconductor ETF — $77.18 Q2 2017 matches XSD June 2017 close
  "46138G508": "BKLN", // Invesco Senior Loan ETF — $20.46 Q1 2020 (COVID crash) matches BKLN range
  // ── End Appaloosa LP-sourced fixes ────────────────────────────────────────────
  "N00985106": "AER",  // "AERCAP HOLDINGS NV" — Yahoo returns R1D.SG (Frankfurt) first; trades NYSE as AER
  "254687106": "DIS",  // "DISNEY WALT CO" — SEC abbreviation confuses Yahoo; NYSE as DIS
  "81686C104": "SEMR", // "SEMRUSH HLDGS INC" — Yahoo misses it; trades NYSE as SEMR
  "G27358103": "DESP", // "DESPEGAR COM CORP" — Cayman CUSIP; trades NYSE as DESP
  "83200N103": "SMAR", // "SMARTSHEET INC" — taken private Jan 2024; was NASDAQ SMAR
  "03662Q105": "ANSS", // "ANSYS INC" — acquired by Synopsys Jun 2024; was NASDAQ ANSS
  "02156B103": "AYX",  // "ALTERYX INC" — taken private Mar 2024; was NYSE AYX
  "05338G106": "AVLR", // "AVALARA INC" — acquired Oct 2022; was NYSE AVLR
  "73739W104": "POSH", // "POSHMARK INC" — acquired by Naver Jan 2023; was NASDAQ POSH
  // ── Ruane, Cunniff & Goldfarb-sourced fixes ───────────────────────────────────────
  // Active stocks Yahoo CUSIP lookup missed or returned wrong exchange
  "469814107": "J",    // "JACOBS ENGR GROUP INC" — renamed to Jacobs Solutions; ticker changed JEC→J in 2019; NYSE as J
  "302130109": "EXPD", // "EXPEDITORS INTL WASH INC" — active logistics company; Yahoo missed CUSIP; NASDAQ as EXPD
  "78463M107": "SPSC", // "SPS COMM INC" — active supply-chain SaaS; Yahoo missed CUSIP; NASDAQ as SPSC
  "025537101": "AEP",  // "AMERICAN ELEC PWR CO INC" — active utility; Yahoo missed CUSIP; NASDAQ as AEP
  // Foreign-incorporated / foreign exchange collisions
  "N31738102": "FCAU", // "FIAT CHRYSLER AUTOMOBILES N" — Dutch-incorporated; Yahoo returns EU listing; was NYSE FCAU (merged into Stellantis 2021)
  "N97284108": "YNDX", // "YANDEX N V" — Dutch holding for Russian internet co.; delisted from Nasdaq 2023; was NASDAQ YNDX
  "N0731H103": "ATAI", // "ATAI LIFE SCIENCES NV" — Dutch-incorporated German biotech; Yahoo returns EU listing; was NASDAQ ATAI
  "463588103": "IRCP", // "IRSA PROPIEDADES COMERCIALES" — Argentine real estate ADS; was NYSE IRCP
  "G6455X107": "NETS", // "NETSHOES CAYMAN LTD" — Cayman-incorporated Brazilian e-com; acquired by Magazine Luiza 2019; was NYSE NETS
  // Acquired / taken-private
  "05591B109": "BMCH", // "BMC STK HLDGS INC" — building products distributor; acquired by US LBM 2018; was NASDAQ BMCH
  "54561105":  "EQH",  // "AXA EQUITABLE HLDGS INC" — renamed Equitable Holdings; was NYSE EQH
  "054561105": "EQH",  // "AXA EQUITABLE HLDGS INC" — renamed Equitable Holdings; was NYSE EQH (both 8 and 9-char forms)
  "78781P105": "SAIL", // "SAILPOINT TECHNLGIES HLDGS" — went private 2022 (Vista Equity); re-IPO'd Nov 2024; was NASDAQ SAIL
  "362393100": "GTT",  // "GTT COMMUNICATIONS INC" — telecom; filed Ch.11 2021, delisted; was NYSE GTT
  "81367P101": "SECO", // "SECOO HLDG LTD" — Chinese luxury e-commerce ADS; delisted; was NASDAQ SECO
  "46005L101": "IMXI", // "INTERNATIONAL MNY EXPRESS IN" — Intermex Wire Transfer; was NASDAQ IMXI
  // SPACs / blank-check companies
  "362409104": "GTYH", // "GTY TECHNOLOGY HOLDINGS INC" — govtech SPAC; completed merger 2019, went private; was NASDAQ GTYH
  "48581R205": "KSPI", // "KASPI KZ JSC" — Kazakh fintech; listed on Nasdaq as KSPI since 2024
  // ETF/fund price-matched identifications
  "922908769": "VTI",  // "VANGUARD INDEX FDS" — Vanguard Total Stock Market ETF; $127.57/share Q4 2018 & ~$285/share 2024 match VTI
  "921909768": "VGLT", // "VANGUARD STAR FDS" — Vanguard Long-Term Government Bond ETF; $62-77/share 2025-2026 matches VGLT duration/rate profile
  // ── End Ruane, Cunniff & Goldfarb-sourced fixes ───────────────────────────────────
  // ── FundSmith LLP-sourced fixes ───────────────────────────────────────────────────
  // Active stocks Yahoo missed
  "832696405": "SJM",   // "SMUCKER J M CO" — J.M. Smucker; Yahoo CUSIP lookup fails; NYSE SJM
  // Acquired companies
  "26138E109": "DPS",   // "DR PEPPER SNAPPLE GROUP INC" — acquired by KDP 2018; was NYSE DPS
  "67383109":  "BCR",   // "BARD C R INC" — C.R. Bard; acquired Becton Dickinson 2017; was NYSE BCR
  "12508E101": "CDK",   // "CDK GBL." — CDK Global; acquired Brookfield Business Partners 2022; was NASDAQ CDK
  "265504100": "DNKN",  // "DUNKIN BRANDS GROUP INC" — Dunkin'; acquired Inspire Brands 2020; was NASDAQ DNKN
  // Foreign-incorporated — Yahoo returns non-US listing
  "M7518J104": "ODD",   // "ODDITY TECH LTD" — Israeli cosmetics; M prefix = Israel; Nasdaq ODD
  "G98239109": "XP",    // "XP CLASS A" — XP Inc.; G prefix = Cayman; Brazilian fintech; Nasdaq XP
  "92932M101": "WNS",   // "WNS HLDGS LTD" / "WNS HOLDINGS - ADR" — Indian BPO ADR; NYSE WNS
  // ── End FundSmith LLP-sourced fixes ───────────────────────────────────────────────
  // ── TCI Fund Management-sourced fixes ─────────────────────────────────────────────
  // Canadian dual-listings — Yahoo returns TSX listing instead of NYSE
  "136375102": "CNI",   // "CANADIAN NATL RY CO" — Canadian National Railway; dual-listed TSX/NYSE; NYSE CNI
  "13645T100": "CP",    // "CANADIAN PAC RY LTD" — Canadian Pacific; dual-listed; NYSE CP
  "13646K108": "CP",    // "CANADIAN PACIFIC KANSAS CITY" — CPKC post-2023 merger with KCS; NYSE CP
  // Foreign-incorporated
  "G47567105": "INFO",  // "IHS MARKIT LTD" — G prefix = Cayman; acquired S&P Global Feb 2022; was NYSE INFO
  // Active stocks Yahoo missed
  "49427F108": "KRC",   // "KILROY RLTY CORP" — Kilroy Realty; active office REIT; NYSE KRC
  // ── End TCI Fund Management-sourced fixes ─────────────────────────────────────────
  // ── Tiger Global Management-sourced fixes ─────────────────────────────────────────
  // Active stocks Yahoo missed via CUSIP lookup
  "339041105": "FLT",   // "FLEETCOR TECHNOLOGIES INC" — payment tech; Yahoo CUSIP lookup fails; NYSE FLT
  "532457108": "LLY",   // "ELI LILLY & CO" / "LILLY ELI & CO" — pharma; Yahoo CUSIP fails; NYSE LLY
  "15677J108": "CDAY",  // "CERIDIAN HCM HLDG INC" — HCM software; Nasdaq CDAY
  "75737F108": "RDFN",  // "REDFIN CORP" — real-estate marketplace; Nasdaq RDFN
  "20717M103": "CFLT",  // "CONFLUENT INC" — data streaming; Nasdaq CFLT
  "47074L105": "JAMF",  // "JAMF HLDG CORP" — Apple device mgmt; Nasdaq JAMF
  "68134L109": "OLO",   // "OLO INC" — restaurant SaaS; NYSE OLO
  "68339B104": "ONTF",  // "ON24 INC" — virtual events platform; NYSE ONTF
  "85225A107": "SQSP",  // "SQUARESPACE INC" — website builder; NYSE SQSP (private 2024 via Permira)
  "05368X102": "AVDX",  // "AVIDXCHANGE HOLDINGS INC" — AP automation; Nasdaq AVDX
  "26856L103": "ELF",   // "E L F BEAUTY INC" — cosmetics; NYSE ELF
  "83417Q105": "SWI",   // "SOLARWINDS CORP" — IT mgmt software; NYSE SWI (re-IPO'd 2018)
  "83417Q204": "SWI",   // "SOLARWINDS CORP" — alternate share-class CUSIP; NYSE SWI
  "770700102": "HOOD",  // "ROBINHOOD MKTS INC" — retail brokerage; Nasdaq HOOD
  "29975E109": "EB",    // "EVENTBRITE INC" — event platform; NYSE EB
  // Foreign-incorporated — Yahoo returns non-US listing
  "G06242104": "TEAM",  // "ATLASSIAN CORP PLC" — G prefix = Cayman; Atlassian; Nasdaq TEAM
  "M7S64H106": "MNDY",  // "MONDAY COM LTD" — M prefix = Israel; Nasdaq MNDY
  "985194109": "YSG",   // "YATSEN HLDG LTD" — G prefix implicit; Chinese cosmetics; NYSE ADR YSG
  "69269L104": "OZON",  // "OZON HLDGS PLC" — Russian e-commerce; delisted Nasdaq (sanctions); was Nasdaq OZON
  "26853A100": "EHIC",  // "EHI CAR SVCS LTD" — Chinese car rental; private 2019; was NYSE EHIC
  "68276W103": "ONE",   // "ONESMART INTL ED GROUP LTD" — Chinese edu; NYSE ONE (delisted 2021 crackdown)
  "74704P108": "NEW",   // "PUXIN LTD" — Chinese test-prep; NYSE NEW (delisted post-crackdown)
  "719156101": "DNK",   // "PHOENIX TREE HLDGS LTD" — Danke Apartment; NYSE DNK (delisted)
  "76761L102": "REDU",  // "RISE ED CAYMAN LTD" — Rise Education; NYSE ADR REDU (delisted 2022)
  "74979W101": "RYB",   // "RYB ED INC" — Chinese childcare; NYSE ADR RYB (delisted)
  "109199109": "BEDU",  // "BRIGHT SCHOLAR ED HLDGS LTD" — Chinese edu; NYSE ADR BEDU
  "25985W105": "DOYU",  // "DOUYU INTERNATIONAL HLDNGS L" / "DOUYU INTL HLDGS LTD" — game streaming; Nasdaq DOYU
  "48214T305": "JTKWY", // "JUST EAT TAKEAWAY COM N V" — Dutch food delivery; US OTC ADR JTKWY
  // Acquired companies — use last known US ticker for historical display
  "98936J101": "ZEN",   // "ZENDESK INC" — CRM; private (Thoma Bravo 2023); was Nasdaq ZEN
  "22266L106": "COUP",  // "COUPA SOFTWARE INC" — procurement SaaS; private (Thoma Bravo 2023); was Nasdaq COUP
  "78489X103": "SVMK",  // "SVMK INC" — SurveyMonkey; renamed Momentive (MNTV) 2021; was Nasdaq SVMK
  "03272L108": "PLAN",  // "ANAPLAN INC" — planning SaaS; private (Thoma Bravo 2022); was NYSE PLAN
  "68269G107": "ONEM",  // "1LIFE HEALTHCARE INC" — One Medical; acquired Amazon 2023; was Nasdaq ONEM
  "747601201": "XM",    // "QUALTRICS INTL INC" — experience mgmt; private (Silver Lake 2023); was Nasdaq XM
  "86646P103": "SUMO",  // "SUMO LOGIC INC" — log analytics; private (Francisco Partners 2023); was Nasdaq SUMO
  "64829B100": "NEWR",  // "NEW RELIC INC" — observability; private (Francisco Partners 2023); was NYSE NEWR
  "29079J103": "EMBK",  // "EMBARK TECHNOLOGY INC" — autonomous trucks; delisted/shutdown 2023; was Nasdaq EMBK
  "29079J202": "EMBK",  // "EMBARK TECHNOLOGY INC" — Class B CUSIP; same Nasdaq EMBK
  "10920V107": "BHG",   // "BRIGHT HEALTH GROUP INC" — health insurance; delisted/bankrupt; was NYSE BHG
  "85572U102": "STRY",  // "STARRY GROUP HOLDINGS INC" — fixed wireless ISP; bankrupt; was Nasdaq STRY
  "53619W101": "LINX",  // "LINX S A" / "LINX SA" — Brazilian software; acquired TOTVS 2021; was NYSE LINX
  "682163100": "ONDK",  // "ON DECK CAP INC" — online lending; acquired Enova 2020; was NYSE ONDK
  "72582H107": "PVTL",  // "PIVOTAL SOFTWARE INC" — cloud platform; acquired VMware 2019; was NYSE PVTL
  "87336U105": "DATA",  // "TABLEAU SOFTWARE INC" — analytics; acquired Salesforce 2019; was NYSE DATA
  "46122T102": "XON",   // "INTREXON CORP" — biotech (now Precigen PGEN); was NYSE XON
  "33812L102": "FIT",   // "FITBIT INC" — wearables; acquired Google 2021; was Nasdaq FIT
  "83409V104": "SOGO",  // "SOGOU INC" — Chinese search; acquired Tencent 2021; was NYSE SOGO
  "18914U100": "CLDR",  // "CLOUDERA INC" — data platform; private (KKR 2021); was NYSE CLDR
  "090043100": "BILL",  // "BILL COM HLDGS INC" — SMB payments; Nasdaq BILL
  "539183103": "LVGO",  // "LIVONGO HEALTH INC" — digital health; acquired Teladoc 2020; was Nasdaq LVGO
  "584021109": "MDLA",  // "MEDALLIA INC" — CX platform; private (Thoma Bravo 2021); was NYSE MDLA
  "418100103": "HCP",   // "HASHICORP INC" — infrastructure software; acquired IBM 2024; was Nasdaq HCP
  "60878Y108": "MNTV",  // "MOMENTIVE GLOBAL INC" — SurveyMonkey rebranded; private (STG 2023); was Nasdaq MNTV
  "23821D100": "MSP",   // "DATTO HLDG CORP" — MSP platform; acquired Kaseya 2022; was NYSE MSP
  "23344D108": "DADA",  // "DADA NEXUS LTD" — Chinese on-demand delivery; private (JD.com 2024); was Nasdaq DADA
  "16955F107": "CD",    // "CHINDATA GROUP HLDGS LTD" — Chinese data centers; private (Bain 2023); was Nasdaq CD
  "49926T104": "KNBE",  // "KNOWBE4 INC" — security training; private (Vista Equity 2023); was Nasdaq KNBE
  "30744W107": "FTCH",  // "FARFETCH LTD" — luxury marketplace; delisted/bankrupt 2023; was NYSE FTCH
  "67181A107": "OSH",   // "OAK STR HEALTH INC" — primary care; acquired CVS 2023; was NYSE OSH
  "577096100": "MTTR",  // "MATTERPORT INC" — 3D spatial data; Nasdaq MTTR (private 2024 via CoStar)
  "02589Y100": "AFCO",  // "AMERICAN FARMLAND CO" — farmland REIT; merged Farmland Partners (FPI) 2017; was NYSE AFCO
  // SPACs (pre-merger or at-listing ticker)
  "G0370L124": "AGC",   // "ALTIMETER GROWTH CORP" — SPAC; merged Grab Holdings (GRAB) Dec 2021; was Nasdaq AGC
  "G8354H100": "SRNG",  // "SOARING EAGLE ACQUISITION CO" — SPAC; merged Ginkgo Bioworks (DNA); was Nasdaq SRNG
  "G5S74L106": "MEKA",  // "MELI KASZEK PIONEER CORP" — SPAC (MercadoLibre/Kaszek); was Nasdaq MEKA
  "G54085124": "LEGA",  // "LEAD EDGE GROWTH OPRTUNTS LT" — Lead Edge Growth SPAC; was Nasdaq LEGA
  "76155Y207": "REVH",  // "REVOLUTION HEALTHCAR AQ CORP" — SPAC; merged Alignment Healthcare (ALHC); was Nasdaq REVH
  "96951B201": "WRAC",  // "WILLIAMS ROWLAND ACQUISITION" — SPAC; was NYSE WRAC
  "G7282L118": "PAQC",  // "PROVIDENT ACQUISITION CORP" — SPAC; was Nasdaq PAQC
  "G8601M100": "SVFB",  // "SVF INVESTMENT CORP 2" — SoftBank Vision Fund SPAC #2; was Nasdaq SVFB
  "G8601N108": "SVFC",  // "SVF INVESTMENT CORP 3" — SoftBank Vision Fund SPAC #3; was Nasdaq SVFC
  // Active stocks Yahoo missed — acquired or delisted
  "G81477104": "SINA",  // "SINA CORP" — Chinese news portal; went private Jul 2021; was Nasdaq SINA
  "264120106": "DCT",   // "DUCK CREEK TECHNOLOGIES INC" — P&C insurance SaaS; private (Vista Equity 2023); was Nasdaq DCT
  "29260Y109": "EDR",   // "ENDEAVOR GROUP HLDGS INC" — entertainment/sports; NYSE EDR
  "848637104": "SPLK",  // "SPLUNK INC" — data/security platform; acquired Cisco Mar 2024; was Nasdaq SPLK
  // ── End Tiger Global Management-sourced fixes ──────────────────────────────────────
  // ── Fairfax Financial Holdings-sourced fixes ──────────────────────────────────────
  // Active stocks Yahoo missed via CUSIP lookup
  "24869P104": "DENN",  // "DENNY'S CORP" — restaurant chain; Nasdaq DENN
  "462726100": "IRBT",  // "IROBOT CORP" — consumer robotics; Amazon deal terminated 2024; Nasdaq IRBT
  "75508B104": "RYAM",  // "RAYONIER ADVANCED MATLS INC" — specialty cellulose; NYSE RYAM
  "87901J105": "TGNA",  // "TEGNA INC" — TV broadcasting; acquired Standard Media 2024; was NYSE TGNA
  "74275G107": "PRTH",  // "PRIORITY TECH HOLDINGS INC" — payments platform; Nasdaq PRTH
  "357023100": "RAIL",  // "FREIGHTCAR AMER INC" — railcar manufacturer; Nasdaq RAIL
  "90346E103": "SLCA",  // "U S SILICA HLDGS INC" / "US SILICA HOLDINGS INC" — acquired Apollo 2024; was NYSE SLCA
  "453415606": "ICD",   // "INDEPENDENCE CONTRACT DRILLING" — drilling services; was NYSE ICD
  "453415309": "ICD",   // "INDEPENDENCE CONTRACT DRIL I" — Class I CUSIP; same NYSE ICD
  // Canadian dual-listings (filed via 13F as US-listed ADRs/NYSE shares)
  "76117W109": "RFP",   // "RESOLUTE FOREST PRODUCTS INC" — paper/pulp; acquired Domtar/Paper Excellence 2023; was NYSE RFP
  "Y75638109": "SSW",   // "SEASPAN CORP" — Y prefix = Cayman; container shipping; acquired Atlas Corp 2023; was NYSE SSW
  "68827L101": "OR",    // "OSISKO GOLD ROYALTIES LTD" — Canadian gold royalty; dual-listed NYSE OR
  "900435108": "TRQ",   // "TURQUOISE HILL RES LTD" — copper miner; acquired Rio Tinto 2022; was NYSE TRQ
  "Y20676105": "DSSI",  // "DIAMOND S SHIPPING INC" — Y prefix; merged International Seaways 2021; was NYSE DSSI
  "70706P104": "PGH",   // "PENGROWTH ENERGY CORP" — Canadian oil&gas; acquired Cona Resources 2020; was NYSE PGH
  "04878Q863": "AT",    // "ATLANTIC POWER CORP" — Canadian power; taken private 2021; was NYSE AT
  "826516106": "SWIR",  // "SIERRA WIRELESS INC" — IoT connectivity; acquired Semtech 2023; was Nasdaq SWIR
  "12626F105": "CRHM",  // "CRH MEDICAL CORP" — anesthesia (Canadian); acquired WELL Health 2021; was NYSE American CRHM
  "G16250105": "BNRE",  // "BROOKFIELD REINS LTD" — G prefix = Cayman; Brookfield Reinsurance Partners; NYSE BNRE
  // Acquired companies — use last known US ticker
  "903293405": "USG",   // "U S G CORP" — wallboard; acquired Knauf 2019; was NYSE USG
  "269279402": "XCO",   // "EXCO RESOURCES INC" — oil&gas; bankrupt 2018; was NYSE XCO
  "269279501": "XCO",   // "EXCO RESOURCES INC" — Class B/preferred CUSIP; same NYSE XCO
  "057755209": "BWINA", // "BALDWIN & LYONS INC" — insurance; merged Protective 2019; was Nasdaq BWINA
  "225223304": "CRAY",  // "CRAY INC" — supercomputers; acquired HPE 2019; was Nasdaq CRAY
  "167250109": "CBI",   // "CHICAGO BRIDGE & IRON CO NV" — engineering; merged McDermott 2018; was NYSE CBI
  "01449J105": "ALR",   // "ALERE INC" — diagnostics; acquired Abbott 2017; was NYSE ALR
  "74972G103": "RPXC",  // "RPX CORP" — patent risk; acquired HGGC 2018; was Nasdaq RPXC
  "140781105": "CRR",   // "CARBO CERAMICS INC" — oilfield; bankrupt/liquidated 2020; was NYSE CRR
  "543881106": "LORL",  // "LORAL SPACE & COM INC" / "LORAL SPACE & COMMUNICATIONS INC" — acquired MHR 2021; was Nasdaq LORL
  "84652J103": "ONCE",  // "SPARK THERAPEUTICS INC" — gene therapy; acquired Roche 2019; was Nasdaq ONCE
  "886547108": "TIF",   // "TIFFANY & CO" — jewelry; acquired LVMH 2021; was NYSE TIF
  "74374N102": "PRVB",  // "PROVENTION BIO INC" — biotech; acquired Sanofi 2023; was Nasdaq PRVB
  "23345J104": "DICE",  // "DICE THERAPEUTICS INC" — biotech; acquired Eli Lilly 2023; was Nasdaq DICE
  "89620X506": "TRIL",  // "TRILLIUM THERAPEUTICS INC" — biotech; acquired Pfizer 2021; was Nasdaq TRIL
  "50187A107": "LHCG",  // "LHC GROUP INC" — home health; acquired UnitedHealth 2023; was Nasdaq LHCG
  "92336X109": "VNE",   // "VEONEER INC" — auto safety; acquired Qualcomm 2023; was NYSE VNE
  "458118106": "IDTI",  // "INTEGRATED DEVICE TECHNOLOGY" — semiconductor; acquired Renesas 2019; was Nasdaq IDTI
  "04269X105": "ARRY",  // "ARRAY BIOPHARMA INC" — biotech; acquired Pfizer 2019; was Nasdaq ARRY
  "529771107": "LXK",   // "LEXMARK INTL INC" — printers; taken private 2016; was NYSE LXK
  "081437105": "BMS",   // "BEMIS INC" — packaging; acquired Amcor 2019; was NYSE BMS
  "92927K102": "WBC",   // "WABCO HLDGS INC" — auto tech; acquired ZF Friedrichshafen 2020; was NYSE WBC
  "92924F106": "WGL",   // "WGL HLDGS INC" — gas utility; acquired AltaGas 2018; was NYSE WGL
  "80589M102": "SCG",   // "SCANA CORP" — electric utility; acquired Dominion Energy 2019; was NYSE SCG
  "283677854": "EE",    // "EL PASO ELEC CO" — electric utility; acquired JPE Holdings 2020; was NYSE EE
  "49803L109": "KITE",  // "KITE PHARMA INC" — biotech; acquired Gilead 2017; was Nasdaq KITE
  "774341101": "COL",   // "ROCKWELL COLLINS INC" — avionics; acquired United Technologies 2018; was NYSE COL
  "23247G109": "CVT",   // "CVENT INC" — event software; taken private 2016, re-IPO'd 2022; was NYSE CVT
  "852857200": "STMP",  // "STAMPS COM INC" — shipping software; acquired Thoma Bravo 2021; was Nasdaq STMP
  "21871D103": "CLGX",  // "CORELOGIC INC" — real estate data; private (Stone Point/Insight 2021); was NYSE CLGX
  "452907108": "IMMU",  // "IMMUNOMEDICS INC" — biotech; acquired Gilead 2020; was Nasdaq IMMU
  "834251100": "SOLY",  // "SOLITON INC" — medical devices; acquired AbbVie 2022; was Nasdaq SOLY
  "75606N109": "RP",    // "REALPAGE INC" — prop-mgmt software; private (Thoma Bravo 2021); was Nasdaq RP
  "92765X208": "VA",    // "VIRGIN AMER INC" — airline; acquired Alaska Air 2016; was Nasdaq VA
  "34553D101": "FSCT",  // "FORESCOUT TECHNOLOGIES INC" — network security; private (Advent 2020); was Nasdaq FSCT
  "85590A401": "HOT",   // "STARWOOD HOTELS & RESORTS WRLD" — acquired Marriott 2016; was NYSE HOT
  "12561W105": "CNL",   // "CLECO CORP" — electric utility; acquired by investors 2016; was NYSE CNL
  "30315R107": "FSTX",  // "F-STAR THERAPEUTICS INC" — bispecific antibody biotech; was Nasdaq FSTX
  "45773Y105": "INWK",  // "INNERWORKINGS INC" — marketing supply chain; acquired HH Global 2020; was Nasdaq INWK
  "209034107": "CNSL",  // "CONSOLIDATED COMM HLDGS INC" / "CONSOLIDATED COMM HOLDINGS INC" — private (Searchlight 2022); was Nasdaq CNSL
  "87817A107": "TMH",   // "TEAM HEALTH HOLDINGS INC" — physician staffing; private (Blackstone 2017); was NYSE TMH
  "15117P102": "CBMG",  // "CELLULAR BIOMEDICINE GROUP INC" — biotech; taken private; was Nasdaq CBMG
  "750459109": "RSYS",  // "RADISYS CORP" — telecom software; acquired Reliance Industries 2018; was Nasdaq RSYS
  "55825T103": "MSGS",  // "MADISON SQUARE GARDEN CO" / "MADISON SQUARE GRDN SPRT COR" — spun off MSGE 2020; surviving entity NYSE MSGS
  "761330109": "RVNC",  // "REVANCE THERAPEUTICS INC" — medical aesthetics; was Nasdaq RVNC
  "69355F102": "PPD",   // "PPD INC" — pharma CRO; acquired Thermo Fisher 2021; was Nasdaq PPD
  // Foreign-incorporated — Yahoo returns non-US listing
  "G20045202": "CETV",  // "CENTRAL EUROPEAN MEDIA ENTERPR" — G prefix = Cayman; acquired PPF Group 2020; was Nasdaq CETV
  "G85347105": "SBBP",  // "STRONGBRIDGE BIOPHARMA PLC" — G prefix = Ireland; acquired Xeris 2022; was Nasdaq SBBP
  "G6518L108": "NLSN",  // "NIELSEN HOLDINGS PLC" — G prefix = Jersey; acquired Elliott/Brookfield 2023; was NYSE NLSN
  "G3157S106": "ESV",   // "ENSCO PLC" — G prefix = UK; merged with Rowan → Valaris; was NYSE ESV
  "G04553106": "ARCE",  // "ARCO PLATFORM LTD" — G prefix = Cayman; Brazilian EdTech; acquired Gen Atlantic 2023; was Nasdaq ARCE
  // ── End Fairfax Financial Holdings-sourced fixes ───────────────────────────────────
  // ── Duquesne Family Office-sourced fixes ───────────────────────────────────────────
  // Active stocks Yahoo missed via CUSIP lookup
  "75615P103": "RETA",   // "REATA PHARMACEUTICALS INC" — acquired Biogen 2023; was Nasdaq RETA
  "925050106": "VRNA",   // "VERONA PHARMA PLC" — UK company; Yahoo returns UK listing; Nasdaq VRNA
  "254709108": "DFS",    // "DISCOVER FINL SVCS" — acquired Capital One 2024; was NYSE DFS
  "85205L107": "SWTX",   // "SPRINGWORKS THERAPEUTICS INC" — acquired Pfizer 2024; was Nasdaq SWTX
  "436440101": "HOLX",   // "HOLOGIC INC" — still public; Yahoo CUSIP collision; Nasdaq HOLX
  "125269100": "CF",     // "CF INDS HLDGS INC" / "CF Ind's Hldgs Inc." — still public; Yahoo collision; NYSE CF
  "929160109": "VMC",    // "VULCAN MATLS CO" — still public; Yahoo CUSIP collision; NYSE VMC
  "31946M103": "FCNCA",  // "FIRST CTZNS BANCSHARES INC N" — First Citizens BancShares; Nasdaq FCNCA
  "03940C100": "ACLX",   // "ARCELLX INC" — CAR-T biotech; still public; Nasdaq ACLX
  "06417N103": "OZK",    // "BANK OZK LITTLE ROCK ARK" — Bank OZK; Yahoo collision; Nasdaq OZK
  "345370860": "F",      // "FORD MTR CO DEL" — Ford Motor; Yahoo CUSIP collision; NYSE F
  "46428R107": "GSG",    // "ISHARES S&P GSCI COMMODITY-" — iShares GSCI Commodity ETF; NYSE GSG
  "07782B104": "BLTE",   // "BELITE BIO INC SPONSORED" — biopharm ADR; Nasdaq BLTE
  // Acquired/merged/delisted companies
  "25470M109": "DISH",   // "DISH NETWORK CORP" — merged EchoStar 2023; was Nasdaq DISH
  "73755L107": "POT",    // "POTASH CORP SASK INC" — merged → Nutrien 2018; was NYSE POT
  "89610F101": "TCDA",   // "TRICIDA INC" — ceased operations 2023; was Nasdaq TCDA
  "03940R107": "ARCH",   // "ARCH RESOURCES INC" — merged → Core Natural Resources 2024; was NYSE ARCH
  "966244105": "WWAV",   // "WHITEWAVE FOODS CO" — acquired Danone 2017; was NYSE WWAV
  "013817101": "AA",     // "ALCOA INC." — pre-split (Nov 2016); was NYSE AA
  "20605P101": "CXO",    // "CONCHO RES INC" — acquired ConocoPhillips 2021; was NYSE CXO
  "045327103": "AZPN",   // "ASPEN TECHNOLOGY INC" — acquired Emerson Electric 2022; was Nasdaq AZPN
  "90214J101": "TWOU",   // "2U INC" — EdTech; bankrupt 2023; was Nasdaq TWOU
  "189464100": "CLVS",   // "CLOVIS ONCOLOGY INC" — bankrupt 2022; was Nasdaq CLVS
  "03349M105": "ANDV",   // "ANDEAVOR" — acquired Marathon Petroleum 2018; was NYSE ANDV
  "565849106": "MRO",    // "MARATHON OIL CORP" — acquired ConocoPhillips 2024; was NYSE MRO
  "015351109": "ALXN",   // "ALEXION PHARMACEUTICALS INC" — acquired AstraZeneca 2021; was Nasdaq ALXN
  "008916108": "AGU",    // "AGRIUM INC" — merged → Nutrien 2018; was NYSE AGU
  "34983P104": "FTSV",   // "FORTY SEVEN INC" — acquired Gilead 2020; was Nasdaq FTSV
  "48205A109": "JUNO",   // "JUNO THERAPEUTICS INC" — acquired Celgene 2018; was Nasdaq JUNO
  "33813J106": "FSR",    // "FISKER INC" — bankrupt 2024; was NYSE FSR
  "46116X101": "ITCI",   // "INTRA CELLULAR THERAPIES INC" — acquired J&J 2025; was Nasdaq ITCI
  "36197T103": "GWPH",   // "GW PHARMACEUTICALS PLC" — acquired Jazz Pharmaceuticals 2021; was Nasdaq GWPH
  "98156Q108": "WWE",    // "WORLD WRESTLING ENTMT INC" — merged UFC → TKO Group 2023; was NYSE WWE
  "110448107": "BTI",    // "BRITISH AMERN TOB PLC" — UK company; NYSE ADR BTI
  "46583P102": "ISEE",   // "IVERIC BIO INC" — acquired Astellas Pharma 2023; was Nasdaq ISEE
  "737010108": "PTLA",   // "PORTOLA PHARMACEUTICALS INC" — acquired Alexion 2020; was Nasdaq PTLA
  "85917A100": "STL",    // "STERLING BANCORP DEL" — acquired Webster Financial 2022; was NYSE STL
  "42809H107": "HES",    // "HESS CORP" — acquired Chevron 2024; was NYSE HES
  "36118A100": "FUSN",   // "FUSION PHARMACEUTICALS INC" — acquired AstraZeneca 2024; was Nasdaq FUSN
  "762760106": "RICE",   // "RICE ENERGY INC" — acquired EQT 2017; was NYSE RICE
  "922107107": "VAPO",   // "VAPOTHERM INC" — bankrupt/delisted 2023; was NYSE VAPO
  "81728A108": "SNSE",   // "SENSEI BIOTHERAPEUTICS INC" — wound down; was Nasdaq SNSE
  "54150E104": "LOMA",   // "LOMA NEGRA CORP" — Argentine cement; NYSE LOMA
  "981558109": "WP",     // "WORLDPAY INC" — acquired FIS 2019; was NYSE WP
  "171757206": "CDTX",   // "CIDARA THERAPEUTICS INC" — bankrupt/acquired 2024; was Nasdaq CDTX
  "23306J309": "DBVT",   // "DBV TECHNOLOGIES S A SPONSORED" — French biotech ADR; Nasdaq DBVT
  "24279D105": "DCRB",   // "DECARBONIZATION PLUS ACQU II" — SPAC; was Nasdaq DCRB
  // Foreign-incorporated — Yahoo returns non-US listing
  "Y09827109": "AVGO",   // "BROADCOM LTD" — Y prefix = Singapore (pre-Delaware reincorp 2018); Nasdaq AVGO
  "M2682V108": "CYBR",   // "CYBERARK SOFTWARE LTD" — M prefix = Israel; still public; Nasdaq CYBR
  "G28302100": "DRGN",   // "DRAGONEER GROWTH OPPORTUN CO" — G prefix = Cayman; SPAC; Nasdaq DRGN
  "020398707": "ALMTF",  // "ALMONTY INDS INC" — Canadian tungsten miner; US OTC ALMTF
  // ── End Duquesne Family Office-sourced fixes ────────────────────────────────────────
  // ── Third Point LLC-sourced fixes ──────────────────────────────────────────────────
  // Activist/event-driven targets — acquired, delisted, or merged
  "835898107": "BID",    // "SOTHEBYS" — taken private Patrick Drahi 2019; was NYSE BID
  "449253103": "IAA",    // "IAA INC" — acquired Ritchie Bros. 2023; was NYSE IAA
  "09215C105": "BKI",    // "BLACK KNIGHT INC" — acquired ICE 2023; was NYSE BKI
  "148806102": "CTLT",   // "CATALENT INC" — acquired Novo Holdings 2024; was NYSE CTLT
  "48283N106": "KDMN",   // "KADMON HLDGS INC" — acquired Sanofi 2021; was NYSE KDMN
  "13781Y103": "CANO",   // "CANO HEALTH INC" — bankrupt 2024; was NYSE CANO
  "74978Q105": "RSPP",   // "RSP PERMIAN INC" — acquired Concho Resources 2018; was NYSE RSPP
  "701877102": "PE",     // "PARSLEY ENERGY INC" — acquired Pioneer Natural Resources 2021; was NYSE PE
  "92210H105": "VNTV",   // "VANTIV INC" — merged → Worldpay 2018; was NYSE VNTV
  "98919V105": "ZAYO",   // "ZAYO GROUP HLDGS INC" — taken private EQT/Digital Bridge 2020; was NYSE ZAYO
  "92332V107": "VTYX",   // "VENTYX BIOSCIENCES INC" — acquired AbbVie ~2024; was Nasdaq VTYX
  "294600101": "ETRN",   // "EQUITRANS MIDSTREAM CORP" — acquired EQT Corp 2024; was NYSE ETRN
  "790849103": "STJ",    // "ST JUDE MED INC" — acquired Abbott 2017; was NYSE STJ
  "24790A101": "DEN",    // "DENBURY INC" — acquired ExxonMobil 2023; was NYSE DEN
  "742962103": "PVTB",   // "PRIVATEBANCORP INC" — acquired CIBC 2017; was Nasdaq PVTB
  "586001109": "SHCO",   // "MEMBERSHIP COLLECTIVE GROUP" / "SOHO HOUSE & CO INC" — same CUSIP; NYSE SHCO
  "21077C107": "WISH",   // "CONTEXTLOGIC INC" — bankrupt 2024; was Nasdaq WISH
  "03765N108": "APIC",   // "APIGEE CORP" — acquired Google 2016; was Nasdaq APIC
  "03940F111": "LFG",    // "ARCHAEA ENERGY INC" — acquired BP 2022; was NYSE LFG
  "413875105": "HRS",    // "HARRIS CORP DEL" — merged → L3Harris 2019; was NYSE HRS
  "966387102": "WLL",    // "WHITING PETE CORP NEW" — acquired Chord Energy 2022; was NYSE WLL
  "98212B103": "WPX",    // "WPX ENERGY INC" — merged Devon Energy 2021; was NYSE WPX
  "69526K105": "PTVE",   // "PACTIV EVERGREEN INC" — taken private 2023; was Nasdaq PTVE
  "81663L101": "SMFR",   // "SEMA4 HOLDINGS CORP" — became GeneDx Holdings (WGS); was Nasdaq SMFR
  "892672106": "TW",     // "TRADEWEB MKTS INC" — still public; Yahoo CUSIP collision; Nasdaq TW
  "85572U110": "STRY",   // "STARRY GROUP HOLDINGS INC" — bankrupt 2023; was NYSE STRY
  "36467J108": "GLPI",   // "GAMING & LEISURE PPTYS INC" — still public; Yahoo collision; Nasdaq GLPI
  "29670E107": "EPRT",   // "ESSENTIAL PPTYS RLTY TR INC" — still public; Yahoo collision; NYSE EPRT
  // Foreign-incorporated — Yahoo returns non-US listing
  "H33700115": "GB",     // "GLOBAL BLUE GROUP HOLDING AG" — H prefix = Switzerland; NYSE GB (still public)
  "H33700107": "GB",     // "GLOBAL BLUE GROUP HOLDING AG" — H prefix, unit class; same NYSE GB
  "N33462107": "FI",     // "FRANKS INTL N V" — N prefix = Netherlands; merged → Expro 2021; was NYSE FI
  "G28923103": "DSEY",   // "DIVERSEY HLDGS LTD" — G prefix = Cayman; taken private 2023; Nasdaq DSEY
  // SPACs — Third Point was a major SPAC investor 2019-2022; ~60 distinct positions
  "30734W109": "FPAC",   // "FAR PT ACQUISITION CORP" — Far Point Acquisition Corp; NYSE FPAC (Third Point affiliate)
  "30734W208": "FPAC",   // "FAR PT ACQUISITION CORP" — unit class; same FPAC
  "482506102": "KVSA",   // "KHOSLA VENTURES ACQUT CO III" — NYSE KVSA
  "482504107": "KVSB",   // "KHOSLA VENTURES ACQUISITION" — Khosla I or II; NYSE KVSB
  "362019119": "GOAC",   // "GO ACQUISITION CORP" — NYSE GOAC
  "362019200": "GOAC",   // "GO ACQUISITION CORP" — unit class; same GOAC
  "204833115": "CPUH",   // "COMPUTE HEALTH ACQUISITIN CO" — NYSE CPUH
  "G4940J114": "IACC",   // "ION ACQUISITION CORP 3 LTD" — G prefix; NYSE IACC
  "G50744104": "JAWS",   // "JAWS ACQUISITION CORP" — G prefix; Peter Thiel SPAC; NYSE JAWS
  "31810Q107": "FTCV",   // "FINTECH ACQUISITION CORP V" — NYSE FTCV (merged → eToro)
  "G0633U127": "ASZ",    // "AUSTERLITZ ACQUISITION CORP" — G prefix; NYSE ASZ
  "G75529126": "RONI",   // "RICE ACQUISITION CORP II" — G prefix; NYSE RONI
  "526749106": "LHAA",   // "LERER HIPPEAU ACQUISITION CO" — NYSE LHAA
  "344328117": "BFT",    // "FOLEY TRASIMENE ACQUISITION" — Foley Trasimene Acq II; NYSE BFT
  "G2770Y110": "DISA",   // "DISRUPTIVE ACQUISITION CORP" — G prefix; NYSE DISA
  "G2770Y128": "DISA",   // "DISRUPTIVE ACQUISITION CORP" — G prefix, unit class; same DISA
  "G23726113": "CRHC",   // "COHN ROBBINS HOLDINGS CORP" — G prefix; Gary Cohn SPAC; NYSE CRHC
  "G82514129": "IPOE",   // "SOCIAL CAPITAL HEDOSOPHA HLD" — G prefix; Chamath SPAC V; NYSE IPOE
  "G8251L113": "IPOD",   // "SOCIAL CAPITAL HEDOSOPHA HLD" — G prefix; Chamath SPAC IV; NYSE IPOD
  "33765Y119": "FMAC",   // "FIRSTMARK HORIZON ACQUISITIO" — FirstMark Horizon Acquisition Corp; NYSE FMAC
  "33765Y200": "FMAC",   // "FIRSTMARK HORIZON ACQUISITIO" — unit class; same FMAC
  "G75130123": "RPLA",   // "REPLAY ACQUISITION CORP" — G prefix; NYSE RPLA
  "G9444H100": "VYGG",   // "VY GLOBAL GROWTH" — G prefix; VY Capital Acquisition; NYSE VYGG
  "G1195N113": "BLUA",   // "BLUESCAPE OPPORTUNITIES ACQU" — G prefix; NYSE BLUA
  "G1195N121": "BLUA",   // "BLUESCAPE OPPORTUNITIES ACQU" — G prefix, unit class; same BLUA
  "G34142102": "FWAB",   // "FIFTH WALL ACQUISITN CORP II" — G prefix; NYSE FWAB
  "G3312L129": "FPAA",   // "FAR PEAK ACQUISITION CORP" — G prefix; NYSE FPAA (distinct from Far Point FPAC)
  "G49393120": "IACB",   // "ION ACQUISITION CORP 2 LTD" — G prefix; NYSE IACB
  "G54094118": "LDHA",   // "LDH GROWTH CORP I" — G prefix; NYSE LDHA
  "G0R21B120": "ACTD",   // "ARCLIGHT CLEAN TRANSITION II" — G prefix; NYSE ACTD
  "G8210L113": "SLAM",   // "SLAM CORP" — G prefix; NYSE SLAM
  "83363K201": "SLAC",   // "SOCIAL LEVERAGE ACQUISN CORP" — NYSE SLAC
  "G1330M129": "BWAQ",   // "BLUE WHALE ACQUISITION CORP" — G prefix; NYSE BWAQ
  "G1330M111": "BWAQ",   // "BLUE WHALE ACQUISITION CORP" — G prefix, unit class; same BWAQ
  "G5462L114": "LVRA",   // "LEVERE HOLDINGS CORP" — G prefix; NYSE LVRA
  "65413D113": "NDAC",   // "NIGHTDRAGON ACQUISITION CORP" — NYSE NDAC
  "65413D204": "NDAC",   // "NIGHTDRAGON ACQUISITION CORP" — unit class; same NDAC
  "G5960S124": "MSAC",   // "MEDICUS SCIENCES ACQUISITION" — G prefix; NYSE MSAC
  "G5960S116": "MSAC",   // "MEDICUS SCIENCES ACQUISITION" — G prefix, unit class
  "G5960S108": "MSAC",   // "MEDICUS SCIENCES ACQUISITION" — G prefix, unit class
  "G58442115": "MARC",   // "MARQUEE RAINE ACQUISITION CO" — G prefix; NYSE MARC
  "G58442123": "MARC",   // "MARQUEE RAINE ACQUISITION CO" — G prefix, unit class; same MARC
  "88825H118": "TSIA",   // "TISHMAN SPEYER INNOVATION CO" — Tishman Speyer Innovation Corp; NYSE TSIA
  "88825H209": "TSIA",   // "TISHMAN SPEYER INNOVATION CO" — unit class; same TSIA
  "62752R209": "TMAC",   // "THE MUSIC ACQUISITION CORP" — NYSE TMAC
  "40749M202": "HLAH",   // "HAMILTON LANE ALLIANCE HLDGS" — NYSE HLAH
  "125841205": "CMLT",   // "CM LIFE SCIENCES III INC" — NYSE CMLT
  "855185104": "STPK",   // "STAR PEAK ENERGY TRANSITION" — merged → Stem Inc; was NYSE STPK
  "44487N208": "HMCO",   // "HUMANCO ACQUISITION CORP" — NYSE HMCO
  "38286R105": "GHVI",   // "GORES HOLDINGS VI INC" — Gores Holdings VI; NYSE GHVI
  "G0447J110": "APNB",   // "ANGEL POND HOLDINGS CORP" — G prefix; SE Asia SPAC; NYSE APNB
  "G1355V103": "BTNB",   // "BRIDGETOWN 2 HOLDINGS LTD" — G prefix; Peter Thiel/Richard Li; NYSE BTNB
  "302438205": "FACA",   // "FIGURE ACQUISITION CORP I" — Figure Acquisition Corp I; NYSE FACA
  "G39714111": "HHLA",   // "HH&L ACQUISITION CO" — G prefix; NYSE HHLA
  "316790104": "FWAA",   // "FIFTH WALL ACQUISITION CORP" — Fifth Wall Acquisition Corp (I); NYSE FWAA
  "855179206": "STPC",   // "STAR PEAK CORP II" — Star Peak Corp II; NYSE STPC
  "G8598Y117": "SOAC",   // "SUSTAINABLE OPPORTNTS ACQ CO" — G prefix; NYSE SOAC
  "187171202": "CLIM",   // "CLIMATE REAL IMPACT SLUTINS" — Climate Real Impact Solutions; NYSE CLIM
  "G50740110": "JWSM",   // "JAWS SPITFIRE ACQUISITION CO" — G prefix; NYSE JWSM
  "47201B202": "JWSA",   // "JAWS HURRICANE ACQUISITN COR" — JAWS Hurricane Acquisition Corp; NYSE JWSA
  "989570205": "ZTAQ",   // "ZIMMER ENERGY TRANSITION ACQ" — Zimmer Energy Transition; NYSE ZTAQ
  "54141L118": "LITT",   // "LOGISTICS INNOVTN TECHNLGS C" — Logistics Innovation Technologies; NYSE LITT
  "54141L209": "LITT",   // "LOGISTICS INNOVTN TECHNLGS C" — unit class; same LITT
  // Third Point — second-pass unit-class variants & newly-surfaced CUSIPs
  "47201B111": "JWSA",   // "JAWS HURRICANE ACQUISITN COR" — unit class A; same JAWS Hurricane
  "G9460A104": "VACQ",   // "VECTOR ACQUISITION CORP II" — G prefix; NYSE VACQ (merged → Rocket Lab RKLB)
  "G0370L116": "AGC",    // "ALTIMETER GROWTH CORP" — G prefix; Brad Gerstner SPAC; NYSE AGC (merged → Grab GRAB)
  "G0633D117": "ASC",    // "AUSTERLITZ ACQUISITION CORP" — G prefix; Austerlitz I (different from II=ASZ); NYSE ASC
  "G23726121": "CRHC",   // "COHN ROBBINS HOLDINGS CORP" — G prefix, unit class; same CRHC
  "344328208": "BFT",    // "FOLEY TRASIMENE ACQUISITION" — unit class; same BFT
  "83363K110": "SLAC",   // "SOCIAL LEVERAGE ACQUISN CORP" — unit class; same SLAC
  "881609101": "TSO",    // "TESORO CORP" — Tesoro Corporation; renamed Andeavor (ANDV) 2017; was NYSE TSO
  "87257M116": "TLGA",   // "TLG ACQUISITION ONE CORP" — TLG Acquisition One Corp; NYSE TLGA
  "482505104": "KVSA",   // "KHOSLA VENTURES ACQUSTN CO I" — explicitly Khosla I; NYSE KVSA
  "G3312L111": "FPAA",   // "FAR PEAK ACQUISITION CORP" — G prefix, unit class; same Far Peak FPAA
  "78463V107": "GLD",    // "SPDR GOLD TR" — SPDR Gold Trust; Yahoo CUSIP collision; NYSE GLD
  "40537Q605": "HK",     // "HALCON RES CORP" — Halcon Resources Corp; NYSE HK (eventually acquired/merged)
  "18978W109": "CMLS",   // "CM LIFE SCIENCES INC" — CM Life Sciences Inc (I); NYSE CMLS
  "16115Q308": "GTLS",   // "CHART INDS INC" — Chart Industries; still public; Yahoo collision; NYSE GTLS
  "G50740128": "JWSM",   // "JAWS SPITFIRE ACQUISITION CO" — G prefix, unit class; same JWSM
  "44487N117": "HMCO",   // "HUMANCO ACQUISITION CORP" — unit class; same HMCO
  "G75529118": "RONI",   // "RICE ACQUISITION CORP II" — G prefix, unit class; same RONI
  "G9460N114": "VLAT",   // "VALOR LATITUDE ACQUISITN COR" — G prefix; NYSE VLAT
  "G8990D125": "TPGB",   // "TPG PACE BEN FIN CORP" — G prefix; TPG Pace Beneficial Finance; NYSE TPGB
  "292766102": "ERF",    // "ENERPLUS CORP" — Canadian E&P company; NYSE ADR ERF
  // ── End Third Point LLC-sourced fixes ───────────────────────────────────────────────

  // ── Icahn Capital LP (CIK 921669) — Carl Icahn ──────────────────────────────────────
  // Icahn-controlled / activist targets that went private or were acquired
  "63934E108": "NAV",    // Navistar International Corporation — Icahn's long-term position; acquired by Traton (Volkswagen) in Nov 2021; NYSE NAV
  "02916P103": "ARII",   // American Railcar Industries Inc — Icahn-controlled MFG company; taken private Oct 2019; NYSE ARII
  "313549404": "FDML",   // Federal-Mogul Holdings Corp — Icahn controlled after 2007 bankruptcy; acquired by Tenneco Oct 2018; NYSE FDML
  "12663P107": "CVRR",   // CVR Refining LP — Icahn-controlled refinery MLP; taken private by CVR Energy Aug 2018; NYSE CVRR
  "032359309": "AFSI",   // AmTrust Financial Services Inc — targeted position; taken private Jul 2018 by Stone Point Capital; NYSE AFSI
  "92870X309": "VLTC",   // Voltari Corporation (formerly Mogreet) — tiny mobile-marketing company; eventually went dark; NYSE VLTC
  "293904108": "ENZN",   // Enzon Pharmaceuticals Inc — shell company; still technically listed; NYSE ENZN
  "818097107": "SSE",    // Seventy Seven Energy Inc — oilfield services; filed bankruptcy Jun 2016; pre-bankruptcy NYSE SSE
  // Warrants
  "674599162": "OXY.WS", // Occidental Petroleum Corp Warrants (Series A, 2019) — traded NYSE as OXY WS; expired Aug 2023
  // Yahoo Finance CUSIP collision resolutions (still-public companies)
  "071705107": "BLCO",   // Bausch + Lomb Corp — spun off from Bausch Health May 2022; NYSE BLCO
  "563571108": "MTW",    // Manitowoc Company Inc — crane manufacturer; still public; NYSE MTW
  // ── End Icahn Capital LP-sourced fixes ───────────────────────────────────────────────

  // ── Public Investment Fund (CIK 1767640) — Saudi Arabia sovereign wealth fund ────────
  "62548M100": "MPLN",   // MultiPlan Corporation — data analytics for healthcare; went public via SPAC (Churchill III) 2020; NYSE MPLN
  "62548M118": "MPLN",   // MultiPlan Corporation — unit/warrant class; same MPLN
  "058586108": "BLDP",   // Ballard Power Systems Inc — Canadian hydrogen fuel cell company; NASDAQ BLDP; Yahoo CUSIP collision
  "204833206": "CPUH",   // Compute Health Acquisition Corp — SPAC unit class; NYSE CPUH (also held by Third Point)
  "204833107": "CPUH",   // Compute Health Acquisition Corp — second unit class; same CPUH
  "G07031100": "BBLN",   // Babylon Holdings Ltd — G prefix (Cayman); digital health SPAC merger; NYSE BBLN; went bankrupt Aug 2023
  "G07031209": "BBLN",   // Babylon Holdings Ltd — G prefix unit class; same BBLN
  "44951Y102": "HYZN",   // Hyzon Motors Inc — hydrogen fuel cell trucks; NASDAQ HYZN; delisted ~2024
  "N80029106": "SSU",    // Signa Sports United NV — N prefix (Netherlands); e-commerce sports retail; NYSE SSU; filed bankruptcy Nov 2023
  // ── End Public Investment Fund-sourced fixes ─────────────────────────────────────────

  // ── Baker Bros. Advisors LP (CIK 1263508) — Felix & Julian Baker ─────────────────────
  // Seagen — Baker Bros' career-defining holding (~$100B peak); acquired by Pfizer Dec 2023
  "81181C104": "SGEN",   // Seagen Inc. (fmr Seattle Genetics) — NASDAQ SGEN; Pfizer acquisition closed Dec 2023
  // Acquired biotech companies
  "74257L108": "PRNB",   // Principia Biopharma Inc. — acquired by Sanofi Aug 2020; NASDAQ PRNB
  "00790T100": "AAAP",   // Advanced Accelerator Applications S.A. — French radiopharma; acquired by Novartis Jan 2018; NASDAQ AAAP
  "00372Y105": "ABLX",   // Ablynx NV — Belgian nanobody pharma; acquired by Sanofi Jun 2018; NASDAQ ABLX
  "185575107": "CMTA",   // Clementia Pharmaceuticals Inc. — acquired by Ipsen Mar 2019; NASDAQ CMTA
  "45252L103": "IMDZ",   // Immune Design Corp. — acquired by Merck Mar 2019; NASDAQ IMDZ
  "09075E100": "BIVV",   // Bioverativ Inc. — hemophilia spinoff from Biogen; acquired by Sanofi Mar 2018; NASDAQ BIVV
  "68570P101": "ORTX",   // Orchard Therapeutics plc — gene therapy; acquired by Kyowa Kirin 2023; NASDAQ ORTX
  "730541109": "PNT",    // POINT Biopharma Global Inc. — radiopharmaceuticals; acquired by Eli Lilly Oct 2023; NASDAQ PNT
  "38406L103": "GRCL",   // Gracell Biotechnologies Inc. — Chinese cell therapy; acquired by AstraZeneca Jan 2024; NASDAQ GRCL
  "03217L106": "AMYT",   // Amryt Pharma plc — Irish rare disease; acquired by Chiesi Mar 2023; NASDAQ AMYT
  "M74231107": "NDRM",   // NeuroDerm Ltd. — M prefix (Israel); CNS drug delivery; acquired by Mitsubishi Tanabe 2017; NASDAQ NDRM
  "503459604": "LJPC",   // La Jolla Pharmaceutical Company — acquired by Innoviva Apr 2022; NASDAQ LJPC
  "G9381B108": "UROV",   // Urovant Sciences Ltd. — G prefix (Cayman); urology biotech; acquired by Sumitomo 2022; NASDAQ UROV
  "87162T206": "SNTA",   // Synta Pharmaceuticals Corp. — merged with Madrigal Pharmaceuticals 2016; NASDAQ SNTA
  // Merged / restructured companies
  "M46135105": "FOMX",   // Foamix Pharmaceuticals Ltd. — M prefix (Israel); merged with Menlo → Vyne Therapeutics 2020; NASDAQ FOMX
  "586858102": "MNLO",   // Menlo Therapeutics Inc. — merged with Foamix → Vyne 2020; NASDAQ MNLO
  "87808K106": "TCRR",   // TCR2 Therapeutics Inc. — merged with Appia Bio 2023; NASDAQ TCRR
  "M2239P109": "ADHD",   // Alcobra Ltd. — M prefix (Israel); CNS; merged with Arctus Biotherapeutics 2017; NASDAQ ADHD
  "09072X101": "BPMX",   // BioPharmX Corporation — merged with Timber Pharmaceuticals 2020; NYSE American BPMX
  // Bankrupt / delisted companies
  "46185L103": "NVTA",   // Invitae Corporation — genetic testing; filed Chapter 11 Feb 2024; NASDAQ NVTA
  "M47364100": "GMDA",   // Gamida Cell Ltd. — M prefix (Israel); cell therapy; filed bankruptcy Jun 2024; NASDAQ GMDA
  "00449L102": "ACHL",   // Achilles Therapeutics plc — UK neoantigen therapy; effectively defunct/delisted ~2023; NASDAQ ACHL
  "87424L108": "TLIS",   // Talis Biomedical Corporation — diagnostics; stock near zero; NASDAQ TLIS
  "87424L207": "TLIS",   // Talis Biomedical Corporation — unit class; same TLIS
  "651511107": "NLNK",   // NewLink Genetics / NovaBay — restructured multiple times; NASDAQ NLNK
  "37186H100": "GTH",    // Genetron Holdings Limited — Chinese cancer genomics; went private/delisted 2023; NASDAQ GTH
  "62957M104": "NBRV",   // Nabriva Therapeutics AG — Austrian antibiotics; delisted ~2022; NASDAQ NBRV
  "29604W108": "ERYP",   // ERYTECH Pharma S.A. — French red-cell biotech; restructured/delisted; NASDAQ ERYP
  "46186M209": "NVIV",   // InVivo Therapeutics Holdings Corp. — spinal cord injury; effectively defunct; NASDAQ NVIV
  "683745103": "OPHT",   // Ophthotech Corporation — renamed Iveric Bio; acquired by Astellas 2023; NASDAQ OPHT (pre-rename)
  "232828509": "CYTR",   // CytRx Corporation — tiny oncology company; still listed; NASDAQ CYTR
  // Still-public companies (Yahoo CUSIP collisions)
  "N5749R100": "MRUS",   // Merus N.V. — N prefix (Netherlands); bispecific antibodies; NASDAQ MRUS
  "30063P105": "EXAS",   // Exact Sciences Corporation — colorectal cancer screening; NASDAQ EXAS
  "01671P100": "ALLK",   // Allakos Inc. — failed phase 3; still listed; NASDAQ ALLK
  "43906K100": "HOOK",   // HOOKIPA Pharma Inc. — arenavirus immunotherapy; NASDAQ HOOK
  "43906K209": "HOOK",   // HOOKIPA Pharma Inc. — unit class; same HOOK
  "09627Y109": "BPMC",   // Blueprint Medicines Corporation — kinase inhibitors; NASDAQ BPMC
  "268158201": "DVAX",   // Dynavax Technologies Corporation — hepatitis B vaccine; NASDAQ DVAX
  "37148K100": "GBIO",   // Generation Bio Co. — non-viral gene therapy; NASDAQ GBIO
  "37148K209": "GBIO",   // Generation Bio Co. — unit class; same GBIO
  "75915K309": "RGLS",   // Regulus Therapeutics Inc. — microRNA therapeutics; NASDAQ RGLS
  "G3165V109": "ARYA",   // ARYA Sciences Acquisition Corp. — G prefix (Cayman); biotech SPAC; NASDAQ ARYA
  "G63365103": "MRAL",   // Mural Oncology plc — G prefix (Cayman); spun off from Alkermes 2024; NASDAQ MRAL
  // Note: 220485AB2 (Corsicanto II Designated Activity Company) is a convertible bond — no equity ticker assigned
  // ── End Baker Bros. Advisors LP-sourced fixes ─────────────────────────────────────────

  // ── Fairholme Capital Management LLC (CIK 1056831) — Bruce Berkowitz ────────────────
  // Sears ecosystem — Berkowitz was one of Sears Holdings' largest outside shareholders
  "812350106": "SHLD",   // Sears Holdings Corporation — filed Chapter 11 Oct 2018; NASDAQ SHLD
  "81752R100": "SRG",    // Seritage Growth Properties — REIT spun out of Sears 2015; NYSE SRG
  "81234D109": "SRSCF",  // Sears Canada Inc — majority-owned Sears subsidiary; TSX SCC / OTC SRSCF; filed bankruptcy 2017
  "812362101": "SHOS",   // Sears Hometown & Outlet Stores — spun from Sears 2012; NASDAQ SHOS; eventual bankruptcy
  // Other acquired / delisted companies
  "40434J100": "HRG",    // HRG Group Inc (fmr Harbinger Group) — parent of Spectrum Brands; merged into SPB 2018; NYSE HRG
  "93964W108": "WPG",    // Washington Prime Group — retail REIT; filed Chapter 11 Jun 2021; NYSE WPG
  "800013104": "SAFM",   // Sanderson Farms Inc — poultry producer; acquired by Wayne Farms/Cargill Aug 2022; NASDAQ SAFM
  // Yahoo Finance CUSIP collisions (still-public or recently split companies)
  "928377100": "VSTO",   // Vista Outdoor Inc — outdoor sports products; NYSE VSTO; split into Revelyst+SportCo 2024
  "84790A105": "SPB",    // Spectrum Brands Holdings Inc — household/pet/garden products; NYSE SPB
  "931427108": "WBA",    // Walgreens Boots Alliance Inc — pharmacy chain; NASDAQ WBA
  "18885T306": "CLPR",   // Clipper Realty Inc — NYC residential REIT; NYSE CLPR
  "726503105": "PAA",    // Plains All American Pipeline LP — midstream oil MLP; NASDAQ PAA
  // ── End Fairholme Capital Management-sourced fixes ────────────────────────────────────

  // ── Paulson & Co. (CIK 1035674) — John Paulson ──────────────────────────────────────
  // Classic merger-arb / event-driven fund; most holdings are acquired, privatised, or bankrupt companies
  // M&A arb targets
  "30224P200": "STAY",   // Extended Stay America — acquired by Blackstone/Starwood Oct 2021; NASDAQ STAY
  "94946T106": "WCG",    // WellCare Health Plans — acquired by Centene Jan 2020; NYSE WCG
  "032511107": "APC",    // Anadarko Petroleum — acquired by Occidental Petroleum Aug 2019; NYSE APC
  "073302101": "BEAV",   // B/E Aerospace — acquired by Rockwell Collins Apr 2017; NASDAQ BEAV
  "756577102": "RHT",    // Red Hat — acquired by IBM Jul 2019; NYSE RHT
  "92532W103": "VSM",    // Versum Materials — acquired by Merck KGaA Oct 2019; NYSE VSM
  "12686C109": "CVC",    // Cablevision Systems — acquired by Altice Jun 2016; NYSE CVC
  "413086109": "HAR",    // Harman International — acquired by Samsung Mar 2017; NYSE HAR
  "485170302": "KSU",    // Kansas City Southern — acquired by Canadian Pacific Dec 2021; NYSE KSU
  "32008D106": "FDC",    // First Data Corp — acquired by Fiserv Jul 2019; NYSE FDC
  "74102M103": "PSDO",   // Presidio — acquired by BC Partners/Apollo Jan 2020; NASDAQ PSDO
  "59408Q106": "MIK",    // Michaels Companies — acquired by Apollo Jun 2021; NASDAQ MIK
  "24802Y105": "DWRE",   // Demandware — acquired by Salesforce Jul 2016; NYSE DWRE
  "64126X201": "NSR",    // Neustar — acquired by TransUnion Dec 2021; NYSE NSR
  "94770V102": "WBMD",   // WebMD — acquired by Internet Brands/KKR Sep 2017; NASDAQ WBMD
  "315785105": "FGL",    // Fidelity & Guaranty Life — acquired by CF Corp Nov 2017; NYSE FGL
  "74876Y101": "Q",      // Quintiles Transnational Holdings — merged with IMS Health to form IQVIA (IQV) May 2016; NYSE Q
  "54142L109": "LOGM",   // LogMeIn — acquired by Francisco Partners/Evergreen Aug 2020; NASDAQ LOGM
  "84760C107": "SPNC",   // Spectranetics — acquired by Philips Sep 2017; NASDAQ SPNC
  "611742107": "MWW",    // Monster Worldwide — acquired by Randstad Oct 2016; NYSE MWW
  "012423109": "AMRI",   // Albany Molecular Research — acquired by Carlyle/CDPQ Dec 2017; NASDAQ AMRI
  "90385D107": "ULTI",   // Ultimate Software — acquired by Hellman & Friedman May 2019; NASDAQ ULTI
  "45672H104": "BLOX",   // Infoblox — acquired by Vista Equity Nov 2016; NYSE BLOX
  "48273J107": "KTWO",   // K2M Group Holdings — acquired by Stryker Jan 2019; NASDAQ KTWO
  "465685105": "ITC",    // ITC Holdings Corp — acquired by Fortis Oct 2016; NYSE ITC
  "45774N108": "IPHS",   // Innophos Holdings — acquired by One Rock Capital Jan 2020; NASDAQ IPHS
  "143436400": "CKEC",   // Carmike Cinemas — acquired by AMC Dec 2016; NASDAQ CKEC
  "04685W103": "ATHN",   // athenahealth — acquired by Veritas/Evergreen Feb 2019; NASDAQ ATHN
  "31430F101": "FCH",    // FelCor Lodging Trust — merged with RLJ Lodging Trust Aug 2017; NYSE FCH
  "128195104": "CAA",    // CalAtlantic Group — merged with Lennar Feb 2018; NYSE CAA
  "42210P102": "HW",     // Headwaters — acquired by Boral Limited Mar 2017; NYSE HW
  "009363102": "ARG",    // Airgas — acquired by Air Liquide May 2016; NYSE ARG
  "29363K105": "ENTL",   // Entellus Medical — acquired by Stryker Mar 2018; NASDAQ ENTL
  "64156L101": "NSU",    // Nevsun Resources — acquired by Zijin Mining Mar 2019; NYSE NSU
  "29978A104": "EVBG",   // Everbridge — acquired by Thoma Bravo Dec 2023; NASDAQ EVBG
  "712704105": "PBCT",   // People's United Financial — acquired by M&T Bank Apr 2022; NASDAQ PBCT
  "14574X104": "TAST",   // Carrols Restaurant Group — acquired by Restaurant Brands Feb 2024; NASDAQ TAST
  "67072V103": "NXTM",   // NxStage Medical — acquired by Fresenius Medical Sep 2019; NASDAQ NXTM
  "74733V100": "QEP",    // QEP Resources — acquired by Diamondback Energy Mar 2021; NYSE QEP
  "177376100": "CTXS",   // Citrix Systems — acquired by Elliott/Vista Sep 2022; NASDAQ CTXS
  "G9019D104": "TVPT",   // Travelport Worldwide — taken private by Siris Capital May 2019; NYSE TVPT
  "380956409": "GG",     // Goldcorp — merged with Newmont Apr 2019; NYSE GG
  "26483E100": "DNB",    // Dun & Bradstreet — taken private by consortium Jan 2019 (re-IPO'd 2020); NYSE DNB
  // Still-public or recently delisted via restructuring
  "48203R104": "JNPR",   // Juniper Networks — still trading; NYSE JNPR
  "12503M108": "CBOE",   // Cboe Holdings — still trading; NASDAQ CBOE
  "13123X102": "CPE",    // Callon Petroleum — still trading (merged into APA Corp 2024); NYSE CPE
  "87968A104": "TELL",   // Tellurian — still trading; NYSE TELL
  "03152W109": "FOLD",   // Amicus Therapeutics — still trading; NASDAQ FOLD
  "269796108": "EGRX",   // Eagle Pharmaceuticals — still trading; NASDAQ EGRX
  "82621J105": "SIEN",   // Sientra — medical aesthetics; NASDAQ SIEN
  "112463104": "BKD",    // Brookdale Senior Living — still trading; NYSE BKD
  "552848103": "MTG",    // MGIC Investment Corp (common stock) — still trading; NYSE MTG
  // Gold / resources
  "49741E100": "KL",     // Kirkland Lake Gold — merged with Agnico Eagle Feb 2022; TSX/NYSE KL
  "74139C102": "PVG",    // Pretium Resources — acquired by Newcrest Feb 2022; TSX/NYSE PVG
  "98400J108": "XCRA",   // Xcerra Corp — acquired by Cohu Sep 2018; NASDAQ XCRA
  // Pharma / biotech / specialty
  "G5785G107": "MNK",    // Mallinckrodt Pharmaceuticals — filed bankruptcy Oct 2020; NYSE MNK (Irish-incorporated)
  "G30401106": "ENDP",   // Endo International — filed bankruptcy Aug 2022; NASDAQ ENDP (Irish-incorporated)
  "009728106": "AKRX",   // Akorn — filed bankruptcy Feb 2020; NASDAQ AKRX
  "G4617B105": "HZNP",   // Horizon Pharma — acquired by Amgen Oct 2023; NASDAQ HZNP (Irish-incorporated)
  "871639308": "SGYP",   // Synergy Pharmaceuticals — filed bankruptcy Jan 2019; NASDAQ SGYP
  "M4059L101": "ENZY",   // Enzymotec — acquired by Frutarom Jan 2018; NASDAQ ENZY (Israeli)
  "M75253100": "ORBK",   // Orbotech — acquired by KLA Feb 2019; NASDAQ ORBK (Israeli)
  "M15332121": "ATTU",   // Attunity — acquired by Qlik Feb 2019; NASDAQ ATTU (Israeli)
  "580037109": "MDR",    // McDermott International — filed bankruptcy Jan 2020; NYSE MDR
  "761299106": "RTRX",   // Retrophin — specialty pharma; NASDAQ RTRX
  "82640U404": "SRRA",   // Sierra Oncology — acquired by GlaxoSmithKline Jun 2022; NASDAQ SRRA
  "038505400": "ARDM",   // Aradigm Corp — filed bankruptcy Jun 2018; NASDAQ ARDM
  // Telecoms / media / tech
  "88706P205": "TSU",    // TIM Participações SA — Brazilian telecom ADR; NYSE TSU
  "60671Q104": "MITL",   // Mitel Networks — acquired by Searchlight Jul 2018; NASDAQ MITL
  "874224207": "TLND",   // Talend SA — data integration ADR; acquired by Qlik Mar 2023; NASDAQ TLND
  "25213A107": "DXM",    // Dex Media — directory publisher; filed bankruptcy May 2016; NYSE DXM
  // Event-driven / special situations
  "19075F106": "CIE",    // Cobalt International Energy — deepwater E&P; filed bankruptcy Dec 2017; NYSE CIE
  "19075F304": "CIE",    // Cobalt International Energy (different series) — same company; NYSE CIE
  "G1644T109": "BSIG",   // BrightSphere Investment Group — asset management; NYSE BSIG (UK-incorporated)
  "G98290104": "XL",     // XL Group — P&C insurance; acquired by AXA Sep 2018; NYSE XL (Irish-incorporated)
  "75605Y106": "RLGY",   // Realogy Holdings — rebranded Anywhere Real Estate; NYSE RLGY
  "12768T103": "CACQ",   // Caesars Acquisition Co — gaming SPAC/merger vehicle; absorbed into CZR 2015; NASDAQ CACQ
  "03965L100": "ARNC",   // Arconic — aluminum products; spun from Alcoa Nov 2016; NYSE ARNC
  "552074700": "WLH",    // William Lyon Homes — homebuilder; acquired by Taylor Morrison Feb 2020; NYSE WLH
  "92923C807": "WCI",    // WCI Communities — homebuilder; acquired by Lennar Aug 2017; NYSE WCI
  "69036R863": "OSG",    // Overseas Shipholding Group (Class A) — emerged bankruptcy 2014; NYSE OSG
  "69036R301": "OSG",    // Overseas Shipholding Group (Class B/units) — same company; NYSE OSG
  "02503Y103": "ACAS",   // American Capital — BDC; acquired by Ares Capital Jan 2017; NASDAQ ACAS
  "11120U105": "BRCM",   // Broadcom Corp — acquired by Avago/Broadcom Feb 2016; NASDAQ BRCM
  "45321L100": "IMPV",   // Imperva — cybersecurity; acquired by Thales Jan 2019; NASDAQ IMPV
  "98462Y100": "AUY",    // Yamana Gold — merged with Pan American Silver/Agnico 2023; NYSE AUY
  "761713106": "RAI",    // Reynolds American — acquired by BAT Jul 2017; NYSE RAI
  "864909106": "SCMP",   // Sucampo Pharmaceuticals — acquired by Mallinckrodt Jan 2018; NASDAQ SCMP
  "025676206": "AEL",    // American Equity Investment Life Holding — still trading; NYSE AEL
  "46071F103": "XENT",   // Intersect ENT — ENT devices; acquired by Medtronic May 2022; NASDAQ XENT
  "233326107": "DST",    // DST Systems — acquired by SS&C Technologies Apr 2018; NYSE DST
  "09238E104": "HAWK",   // Blackhawk Network Holdings — acquired by Silver Lake Mar 2018; NASDAQ HAWK
  "876664103": "TCO",    // Taubman Centers — acquired by Simon Property Group Jun 2020; NYSE TCO
  "096761101": "BOBE",   // Bob Evans Farms — acquired by Post Holdings Jan 2018; NASDAQ BOBE
  "G9319H102": "VR",     // Validus Holdings — acquired by AIG Jan 2018; NYSE VR (Bermuda-incorporated)
  "14964U108": "CAVM",   // Cavium — acquired by Marvell Technology Jul 2018; NASDAQ CAVM
  // ── End Paulson & Co.-sourced fixes ──────────────────────────────────────────────────

  // ── Viking Global Investors (CIK 1103804) — Andreas Halvorsen ────────────────────────
  // Long/short global equity; heavy healthcare M&A and biotech pipeline plays
  // Large-cap acquired / still-trading
  "45720L107": "INBX",   // Inhibrx — acquired by Roche Jan 2024; NASDAQ INBX
  "891160509": "TD",     // Toronto-Dominion Bank — still trades; NYSE TD
  "159864107": "CRL",    // Charles River Laboratories — still trades; NYSE CRL
  "08579W103": "BERY",   // Berry Global Group — still trades; NYSE BERY
  "534187109": "LNC",    // Lincoln National Corp — still trades; NYSE LNC
  "G0260P102": "AS",     // Amer Sports — IPO'd Feb 2024; NYSE AS (Cayman Islands)
  // Healthcare / pharma acquired
  "75525N107": "RYZB",   // RayzeBio — acquired by BMS Jan 2024; NASDAQ RYZB
  "87166B102": "SYNH",   // Syneos Health — acquired by PE consortium Sep 2023; NASDAQ SYNH
  "670704105": "NUVA",   // NuVasive — merged with Globus Medical Sep 2023; NASDAQ NUVA
  "49705R105": "KNTE",   // Kinnate Biopharma — acquired by Pfizer Jan 2024; NASDAQ KNTE
  "24344T101": "DCPH",   // Deciphera Pharmaceuticals — acquired by Novo Nordisk Jul 2024; NASDAQ DCPH
  "87410C104": "TALS",   // Talaris Therapeutics — merged with Tourmaline Bio 2023; NASDAQ TALS
  "926613100": "VIE",    // Viela Bio — acquired by Horizon Therapeutics Mar 2021; NASDAQ VIE
  "G11196105": "BHVN",   // Biohaven Pharmaceutical — acquired by Pfizer Oct 2022; NYSE BHVN (Bermuda)
  "28249H104": "EIDX",   // Eidos Therapeutics — acquired by BridgeBio Jun 2021; NASDAQ EIDX
  "82489T104": "SWAV",   // ShockWave Medical — acquired by J&J May 2024; NASDAQ SWAV
  "54300N103": "LBPH",   // Longboard Pharmaceuticals — acquired by AbbVie Nov 2024; NASDAQ LBPH
  "45114M109": "ICVX",   // Icosavax — acquired by AstraZeneca Jan 2024; NASDAQ ICVX
  "040047607": "ARNA",   // Arena Pharmaceuticals — acquired by Pfizer Mar 2022; NASDAQ ARNA
  "881569107": "TSRO",   // TESARO — acquired by GSK Jan 2019; NASDAQ TSRO
  // Envision Healthcare (pre- and post-AmSurg merger — same ticker, different CUSIP)
  "29413U103": "EVHC",   // Envision Healthcare Holdings (pre-merger entity) — NYSE EVHC
  "29414D100": "EVHC",   // Envision Healthcare Corp (post-merger entity) — NYSE EVHC
  "03232P405": "AMSG",   // AmSurg Corp — merged into Envision Healthcare Dec 2016; NASDAQ AMSG
  // Healthcare services
  "45329R109": "INCR",   // INC Research Holdings — merged with inVentiv → Syneos Aug 2017; NASDAQ INCR
  "023436108": "AMED",   // Amedisys — acquired by UnitedHealth Jul 2024; NASDAQ AMED
  "59267L107": "MTSR",   // Metsera — GLP-1 biotech; IPO'd 2025; NASDAQ MTSR
  // Industrial / services acquired
  "36555P107": "GDI",    // Gardner Denver Holdings — merged with Ingersoll Rand Feb 2020; NYSE GDI
  "400110102": "GRUB",   // Grubhub — acquired by Just Eat Takeaway Jun 2021; NYSE GRUB
  "579063108": "MCFE",   // McAfee Corp — acquired by investor group Mar 2022; NASDAQ MCFE
  "N6865W105": "PTHN",   // Patheon NV — acquired by Thermo Fisher Feb 2017; NYSE PTHN (Netherlands)
  "80283M101": "SC",     // Santander Consumer USA — acquired by Banco Santander Oct 2022; NYSE SC
  // Energy
  "30227M105": "XOG",    // Extraction Oil and Gas — acquired by Civitas Nov 2021; NASDAQ XOG
  "171798101": "XEC",    // Cimarex Energy — acquired by Coterra Oct 2021; NYSE XEC
  "27890G100": "ECR",    // Eclipse Resources — merged → Montage Resources Feb 2019; NYSE ECR
  "212015101": "CLR",    // Continental Resources — went private Oct 2022; NYSE CLR
  "18911Q102": "CLD",    // Cloud Peak Energy — filed bankruptcy May 2019; NYSE CLD
  // Still-trading
  "679369108": "OLPX",   // Olaplex Holdings — NASDAQ OLPX
  "410345102": "HBI",    // Hanesbrands — NYSE HBI
  "654110105": "NKLA",   // Nikola Corp — NASDAQ NKLA
  "91822J103": "VBIV",   // VBI Vaccines — NASDAQ VBIV
  "87190U100": "TDCX",   // TDCX Inc — Singapore BPO; NYSE TDCX
  "64157F103": "NVRO",   // Nevro Corp — NYSE NVRO
  "83193E102": "EM",     // Smart Share Global (Energy Monster) — NASDAQ EM
  "33616C100": "FRC",    // First Republic Bank — seized by FDIC May 2023; NYSE FRC
  // SPACs
  "68626A207": "OHPA",   // Orion Acquisition Corp — NYSE OHPA
  "62477L107": "MUDS",   // Mudrick Capital Acquisition Corp II — NASDAQ MUDS
  // Went private
  "918194101": "VCA",    // VCA Inc — acquired by Mars Sep 2017; NASDAQ VCA
  // ── End Viking Global Investors-sourced fixes ─────────────────────────────────────────

  // ── Greenlight Capital (CIK 1079114 + linkedCik 1489933) — David Einhorn ─────────────
  // CONSOL Energy ecosystem — Einhorn's dominant multi-year position
  "20854P109": "CNX",    // Old CONSOL Energy Inc (pre-Nov 2017 split); NYSE CNX (now CNX Resources natural gas)
  "20854L108": "CEIX",   // New CONSOL Energy Inc (post-split coal division); NYSE CEIX
  "20855T100": "CCR",    // CONSOL Coal Resources LP — coal royalties MLP; acquired back by CONSOL Energy Sep 2020; NYSE CCR
  "12592V100": "CNXC",   // CNX Coal Resources LP — pre-rename version of CCR; NYSE CNXC
  // Acquired / taken-private companies
  "G60754101": "KORS",   // Michael Kors Holdings Ltd — G prefix (Cayman); NYSE KORS; renamed Capri Holdings (CPRI) 2018
  "131347304": "CPN",    // Calpine Corp — power producer; taken private by ECP Group Mar 2018; NYSE CPN
  "41902R103": "HTS",    // Hatteras Financial Corp — mortgage REIT; acquired by Annaly Capital Jul 2016; NYSE HTS
  "02314M108": "AYA",    // Amaya Inc — online poker/gambling; NASDAQ AYA; renamed Stars Group (TSGI) 2017
  "049164205": "AAWW",   // Atlas Air Worldwide Holdings Inc — air cargo; acquired by Apollo consortium Aug 2023; NASDAQ AAWW
  "767754104": "RAD",    // Rite Aid Corp — pharmacy chain; filed Chapter 11 Oct 2023; NYSE RAD
  "G0551A103": "ARRS",   // ARRIS International Inc — G prefix (Cayman); cable equipment; acquired by CommScope Apr 2019; NASDAQ ARRS
  "80874P109": "SGMS",   // Scientific Games Corp — lottery/gaming; NASDAQ SGMS; renamed Light & Wonder 2022
  "82568P304": "SFLY",   // Shutterfly Inc — photo printing; taken private by Apollo Global Sep 2019; NASDAQ SFLY
  "878237106": "TECD",   // Tech Data Corp — IT distributor; acquired by Apollo Global Sep 2020; NASDAQ TECD
  "457153104": "IM",     // Ingram Micro Inc — IT distributor; taken private by HNA Group Dec 2016; NASDAQ IM
  "45845P108": "ICPT",   // Intercept Pharmaceuticals Inc — liver disease; acquired by Alfasigma Jan 2024; NASDAQ ICPT
  "30227M303": "XOG",    // Extraction Oil & Gas Inc — Wattenberg Basin E&P; merged with Bonanza Creek → Civitas Nov 2021; NASDAQ XOG
  "G3166L100": "ESV",    // Ensco Rowan PLC — G prefix (Cayman); offshore driller; merged with Valaris Feb 2019; NYSE ESV
  "86732Y109": "SUNE",   // SunEdison Inc — solar energy; filed Chapter 11 Apr 2016; NYSE SUNE
  "356108100": "FRED",   // Fred's Inc — dollar store/pharmacy chain; filed Chapter 7 Sep 2019; NASDAQ FRED
  "Y8564M105": "TGP",    // Teekay LNG Partners LP — Y prefix (Bermuda); LNG shipping; taken private by Teekay Corp Jan 2022; NYSE TGP
  "34431F104": "FPA",    // Foley Trasimene Acquisition Corp I — NYSE FPA; merged with Paysafe Group 2020
  // Bankruptcy / restructured
  "236272100": "DNMR",   // Danimer Scientific Inc — bioplastics; NYSE DNMR; filed bankruptcy Jan 2024
  "236272118": "DNMR",   // Danimer Scientific Inc — unit class; same DNMR
  "64132K102": "NBSE",   // NeuBase Therapeutics Inc — antisense therapy; NASDAQ NBSE; renamed Tevogen Bio 2024
  "64132K201": "NBSE",   // NeuBase Therapeutics Inc — unit class; same NBSE
  "72814P109": "PLBY",   // PLBY Group Inc (fmr Playboy Enterprises) — NASDAQ PLBY; delisted 2024
  "13803R102": "GOEV",   // Canoo Inc — EV startup; NASDAQ GOEV; essentially defunct
  "74374T117": "PTRA",   // Proterra Inc — EV bus; NASDAQ PTRA; filed Chapter 11 Aug 2023
  "90138Q116": "ME",     // 23andMe Holding Co — consumer genomics; NASDAQ ME; filed Chapter 11 Mar 2024
  "90138Q108": "ME",     // 23andMe Holding Co — unit class; same ME
  "04634X111": "ASTR",   // Astra Space Inc — small launch vehicle; NASDAQ ASTR; operations ceased 2023
  "04634X103": "ASTR",   // Astra Space Inc — unit class; same ASTR
  "536221112": "LEV",    // The Lion Electric Company — EV bus; NYSE LEV; practical insolvency 2024
  // Still-public companies (Yahoo Finance CUSIP collisions)
  "88337F105": "ODP",    // The ODP Corp (Office Depot + OfficeMax); NASDAQ ODP
  "05351W103": "AGR",    // Avangrid Inc — Iberdrola US subsidiary; NYSE AGR
  "44919P508": "IAC",    // IAC/InterActiveCorp (old CUSIP pre-spinoffs); NASDAQ IAC
  "37940X102": "GPN",    // Global Payments Inc; NYSE GPN
  "87265H109": "TPH",    // Tri Pointe Group Inc — homebuilder; NYSE TPH
  "17888H103": "CIVI",   // Civitas Resources Inc — Colorado E&P; NYSE CIVI
  "649445103": "NYCB",   // New York Community Bancorp Inc; NYSE NYCB
  "678026105": "OIS",    // Oil States International Inc — oilfield services; NYSE OIS
  "948626106": "WW",     // Weight Watchers International New (renamed WW International); NYSE WW
  "85208M102": "SFM",    // Sprouts Farmers Market Inc; NASDAQ SFM
  "086516101": "BBY",    // Best Buy Inc; NYSE BBY
  "02503X105": "AGNC",   // American Capital Agency Corp (= AGNC Investment Corp); NASDAQ AGNC
  "G5480U138": "LBTYA",  // Liberty Global PLC Class A — G prefix (UK); NASDAQ LBTYA
  "00547W208": "ADMP",   // Adamis Pharmaceuticals Corp; NASDAQ ADMP
  // SPAC positions — 2020–2022 wave
  "G06536125": "WAVC",   // Waverley Capital Acquisition Corp — G prefix; NYSE WAVC
  "31809Y202": "FSRV",   // FinServ Acquisition Corp II — NASDAQ FSRV
  "318085115": "FSRV",   // FinServ Acquisition Corp I — NASDAQ FSRV
  "31809Y111": "FSRV",   // FinServ Acquisition Corp II — unit class; same FSRV
  "86846V108": "SPNV",   // Supernova Partners Acquisition Corp — NYSE SPNV
  "G7483N129": "RTP",    // Reinvent Technology Partners — G prefix; NASDAQ RTP (Reid Hoffman/Mark Pincus SPAC)
  "G7484L114": "RTPY",   // Reinvent Technology Partners Y — G prefix; NASDAQ RTPY
  "G6882C106": "PANA",   // Panacea Acquisition Corp II — G prefix; NASDAQ PANA
  "698102118": "PANA",   // Panacea Acquisition Corp I — NASDAQ PANA
  "G8354H126": "SRNG",   // Soaring Eagle Acquisition Corp — G prefix; NASDAQ SRNG
  "G8251K107": "IPOA",   // Social Capital Hedosophia Holdings Corp I — G prefix; NYSE IPOA; merged with Virgin Galactic → SPCE
  "G65305107": "NGAC",   // NextGen Acquisition Corp — G prefix; NASDAQ NGAC
  "G75529100": "RONI",   // Rice Acquisition Corp II — G prefix; same RONI (also Third Point)
  "G9446E113": "VGAC",   // VG Acquisition Corp — G prefix; NYSE VGAC; merged with 23andMe → ME
  "66516T112": "NGA",    // Northern Genesis Acquisition Corp — NYSE NGA; merged with Lion Electric → LEV
  "84918M106": "SEAH",   // Sports Entertainment Acquisition Corp — NYSE SEAH
  "629070103": "NEBC",   // Nebula Caravel Acquisition Corp — NYSE NEBC
  "00775W201": "AEAC",   // Aequi Acquisition Corp — NASDAQ AEAC
  "74348Q116": "PSAC",   // Property Solutions Acquisition Corp — NASDAQ PSAC
  "G0103T105": "ACIC",   // Acies Acquisition Corp — G prefix; NASDAQ ACIC; merged with Playtika → PLTK
  "307359117": "FFIE",   // Faraday Future Intelligent Electric Inc — NASDAQ FFIE
  "G8990D117": "TPGB",   // TPG Pace Beneficial Finance Corp — G prefix unit class; same TPGB (also Third Point)
  "G9441E118": "VPCC",   // VPC Impact Acquisition Holdings III — G prefix; NASDAQ VPCC
  "233277110": "DMYD",   // dMY Technology Group Inc II — NYSE DMYD
  "233278100": "DMYI",   // dMY Technology Group Inc III — NYSE DMYI
  "443761101": "HUDA",   // Hudson Executive Investment Corp — NASDAQ HUDA
  "435063110": "HOL",    // HoliCity Inc — NASDAQ HOL; merged with Ginkgo Bioworks → DNA
  "68622E112": "BARK",   // The Original BARK Company — NYSE BARK; SPAC merger 2021
  "665742110": "NSTB",   // Northern Star Acquisition Corp — NYSE NSTB
  "34619R110": "FRX",    // Forest Road Acquisition Corp — NYSE FRX
  "G04561125": "ACTD",   // Arclight Clean Transition Corp — G prefix; NASDAQ ACTD (also Third Point)
  "90069K112": "THCB",   // Tuscan Holdings Corp — NASDAQ THCB; merged with Microvast → MVST
  "18716C118": "CLIM",   // Climate Change Crisis Real Impact I Acquisition Corp — NYSE CLIM (also Third Point)
  "G0083D104": "ACEV",   // ACE Convergence Acquisition Corp — G prefix; NASDAQ ACEV
  // Note: 57060U100 (Market Vectors ETF), 46137V100/357 (Invesco ETFs), 78464A631/714 (SPDR ETFs),
  //       33733E807 (First Trust ETF), 46090F100 (Invesco ETF) — CUSIP→specific ticker unresolvable
  // ── End Greenlight Capital-sourced fixes ──────────────────────────────────────────────

  // ── Joho Capital (CIK 1106500) — Robert Karr ──────────────────────────────────────────
  "53814L108": "LTHM",   // Livent Corp (lithium; merged into Arcadium Lithium 2023; held Q1 2020–Q4 2022)
  "65290E101": "NXT",    // NextTracker Inc (solar tracker; IPO Feb 2023)
  "625383104": "LABL",   // Multi-Color Corp (label solutions; went private 2019; held Q1–Q3 2016)
  "16954L105": "COE",    // China Online Education Group / 51Talk (NYSE)
  // ── End Joho Capital-sourced fixes ────────────────────────────────────────────────────

  // ── Trian Fund Management (CIK 1345471) — Nelson Peltz ────────────────────────────────
  "G4474Y214": "JHG",    // Janus Henderson Group plc — ordinary shares (G-prefix = UK-incorporated, NYSE: JHG)
  "G4474Y904": "JHG",    // Janus Henderson Group plc — alternate share class CUSIP, same company
  "263534109": "DD",     // E.I. du Pont de Nemours & Co. (held Q1–Q4 2016, pre-DowDuPont merger)
  "524901105": "LM",     // Legg Mason Inc. (acquired by Franklin Templeton 2020; held through Q4 2019)
  // ── End Trian Fund Management-sourced fixes ────────────────────────────────────────────

  // ── Brave Warrior Advisors (CIK 1553733) — Glenn Greenberg ────────────────────────────
  "g5480u104": "LBTYA",  // Liberty Global PLC Class A (G-prefix = UK-incorporated; NASDAQ: LBTYA)
  "g5480u120": "LBTYK",  // Liberty Global PLC Class C (alternate share class)
  "601137102": "MRP",    // Millrose Properties Inc (Lennar spinoff, began trading Feb 2025)
  "n20146101": "CMPR",   // Cimpress N.V. (parent of Vistaprint; N-prefix = Netherlands-incorporated)
  "g6518l108": "NLSN",   // Nielsen Holdings PLC (G-prefix = UK-incorporated; went private Oct 2022)
  "30303m102": "META",   // Facebook Inc (pre-rename CUSIP; became Meta Platforms Oct 2021)
  "30219g108": "ESRX",   // Express Scripts Holding Co (acquired by Cigna Dec 2018)
  "74876y101": "IQV",    // Quintiles IMS Holdings Inc (merged/renamed IQVIA Holdings 2017)
  "91911k102": "VRX",    // Valeant Pharmaceuticals Intl (renamed Bausch Health 2018)
  "31847R102": "FAF",    // First American Financial Corp (CUSIP uppercase variant)
  "31847r102": "FAF",    // First American Financial Corp (CUSIP lowercase variant)
  "g16234109": "BBU",    // Brookfield Business Partners LP (G-prefix = Bermuda-incorporated; NYSE: BBU)
  "53071m856": "QVCA",   // Liberty Interactive Corp Series A QVC Group (tracking stock)
  "03675y103": "AMGP",   // Antero Midstream GP LP (merged into Antero Midstream Corp 2019)
  "85225a107": "SQSP",   // Squarespace Inc (direct listing May 2021; NYSE: SQSP)
  "12508e101": "CDK",    // CDK Global Inc (acquired by Brookfield Business Partners Aug 2022)
  // ── End Brave Warrior Advisors-sourced fixes ───────────────────────────────────────────

  // ── Aquamarine Capital Management (CIK 1404599) — Guy Spier ──────────────────────────
  "60505104": "BAC",    // Bank of America Corp (NYSE: BAC)
  "29336T100": "ENLC",  // EnLink Midstream LLC (NYSE: ENLC)
  // ── End Aquamarine Capital Management-sourced fixes ───────────────────────────────────

  // ── Polen Capital Management (CIK 1034524) — David Polen ─────────────────────────────
  "021369103": "ALTR",   // Altair Engineering Inc (Nasdaq: ALTR)
  "58471A105": "MDSO",   // Medidata Solutions Inc (Nasdaq: MDSO; acquired by Dassault 2019)
  "185123106": "CWAN",   // Clearwater Analytics Holdings Inc (NYSE: CWAN)
  "29404K106": "ENV",    // Envestnet Inc (NYSE: ENV; acquired by Bain Capital 2024)
  "V5633W109": "MMYT",   // MakeMy Trip Ltd (Nasdaq: MMYT)
  "29109X106": "AZPN",   // Aspen Technology Inc (Nasdaq: AZPN; Emerson merger 2022)
  "45780R101": "IBP",    // Installed Building Products Inc (NYSE: IBP)
  "609839105": "MPWR",   // Monolithic Power Systems Inc (Nasdaq: MPWR)
  "75955B102": "RELX",   // RELX NV (NYSE: RELX; formerly Reed Elsevier)
  "67079K100": "SMR",    // NuScale Power Corp (NYSE: SMR)
  "L1995B107": "CAAP",   // Corporacion America Airports SA (NYSE: CAAP)
  "55406W103": "MYTE",   // Mytheresa / MYT Netherlands Parent BV (NYSE: MYTE)
  "138098108": "CMD",    // Cantel Medical Corp (NYSE: CMD; acquired by Steris 2021)
  "740444104": "PLPC",   // Preformed Line Products Co (Nasdaq: PLPC)
  "90337L108": "USPH",   // U.S. Physical Therapy Inc (NYSE: USPH)
  "28849P100": "ELLI",   // Ellie Mae Inc (NYSE: ELLI; acquired by Thoma Bravo 2019)
  "67069D108": "NTRI",   // Nutrisystem Inc (Nasdaq: NTRI; acquired by Tivity Health 2019)
  "624756102": "MLI",    // Mueller Industries Inc (NYSE: MLI)
  "G39108108": "GTES",   // Gates Industrial Corp plc (NYSE: GTES)
  "74112D101": "PBH",    // Prestige Consumer Healthcare / Prestige Brands Holdings (NYSE: PBH)
  "163086101": "CHEF",   // Chef's Warehouse Inc (Nasdaq: CHEF)
  "600551204": "MLR",    // Miller Industries Inc Tennessee (NYSE: MLR)
  "88362T103": "THR",    // Thermon Group Holdings Inc (NYSE: THR)
  "922417100": "VECO",   // Veeco Instruments Inc (Nasdaq: VECO)
  "21676P103": "CPS",    // Cooper-Standard Holdings Inc (NYSE: CPS)
  "55405Y100": "MTSI",   // MACOM Technology Solutions Holdings Inc (Nasdaq: MTSI)
  "930427109": "WAGE",   // WageWorks Inc (NYSE: WAGE; acquired by HealthEquity 2019)
  "80517M109": "SVV",    // Savers Value Village Inc (NYSE: SVV)
  // intentional nulls: 37954Y889 (Global X ETF trust), 922908736/92206C680 (Vanguard mutual fund shares),
  //   46137V357/337344105 (Invesco/First Trust ETF trusts), 248019101 (Deluxe debt note),
  //   G1827P106 (Cantor SPAC), 62945V109 (NV5 Global — ticker unconfirmed)
  // ── End Polen Capital Management-sourced fixes ────────────────────────────────────────

  // ── Egerton Capital (CIK 1581811) — John Armitage ─────────────────────────────────────
  "573284106": "MLM",    // Martin Marietta Materials Inc (NYSE: MLM)
  "09257W100": "BXMT",   // Blackstone Mortgage Trust Inc (NYSE: BXMT)
  "09261X102": "BXSL",   // Blackstone Secured Lending Fund (NYSE: BXSL)
  "100557107": "SAM",    // Boston Beer Company Inc (NYSE: SAM)
  // ── End Egerton Capital-sourced fixes ─────────────────────────────────────────────────
};

/**
 * Normalise an SEC 13F company name for better Yahoo Finance search matching.
 * Expands common abbreviations and strips geographic/class suffixes.
 */
function normalizeSecName(name: string): string {
  const abbrevs: Array<[RegExp, string]> = [
    [/\bFINL\b/gi,   "Financial"],
    [/\bPETE\b/gi,   "Petroleum"],
    [/\bHLDGS\b/gi,  "Holdings"],
    [/\bHLDG\b/gi,   "Holding"],
    [/\bAMER\b/gi,   "American"],
    [/\bINTL\b/gi,   "International"],
    [/\bCENTY\b/gi,  "Century"],
    [/\bCOMM\b/gi,   "Communications"],
    [/\bSVCS\b/gi,   "Services"],
    [/\bTECH\b/gi,   "Technologies"],
    [/\bGRP\b/gi,    "Group"],
    [/\bSYS\b/gi,    "Systems"],
    [/\bMGMT\b/gi,   "Management"],
    [/\bMFG\b/gi,    "Manufacturing"],
    [/\bENTMT\b/gi,  "Entertainment"],
    [/\bENT\b/gi,    "Entertainment"],
    [/\bINS\b/gi,    "Insurance"],
    [/\bBK\b/gi,     "Bank"],
  ];

  let result = name;
  for (const [pattern, replacement] of abbrevs) {
    result = result.replace(pattern, replacement);
  }

  // Strip trailing geographic indicators, bond descriptors, and share-class suffixes
  result = result
    .replace(/\s+(SWITZ|DEL|NJ|NY|DE|IRL|CAYMAN)\s*$/i, "")
    .replace(/\s+MTN\s+BE\s*$/i, "")
    .replace(/\s+\bBE\b\s*$/i, "")
    .replace(/\s+NEW\s*$/i, "")       // "HEICO CORP NEW" → "HEICO CORP" (new share class)
    .replace(/\s+\b[A-Z]\s*$/,  "")  // "CHARTER INC N" → "CHARTER INC" (single-letter class)
    .trim();

  return result;
}

// ─── SEC EDGAR headers (required by SEC fair-access policy) ──────────────────

const SEC_HEADERS = {
  "User-Agent": "StockResearchPlatform research@stockresearch.app",
  "Accept-Encoding": "gzip, deflate",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Quarter label helpers ────────────────────────────────────────────────────

/** Converts a YYYY-MM-DD report date to "Q1 2026" format. */
export function reportDateToQuarter(reportDate: string): string {
  const [year, month] = reportDate.split("-").map(Number);
  if (!year || !month) return reportDate;
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q} ${year}`;
}

// ─── CUSIP → Ticker via Yahoo Finance name search ────────────────────────────

async function resolveWithYahooSearch(
  cusipNames: Map<string, string>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (cusipNames.size === 0) return result;

  for (const [cusip, rawName] of cusipNames) {
    const name = normalizeSecName(rawName);
    try {
      // validateResult: false bypasses the stale yahoo-finance2 v3 schema that
      // rejects 'Equity' typeDisp (expects lowercase 'equity') — data is correct
      const resp = await (_yf as any).search(
        name,
        { quotesCount: 10, newsCount: 0 },
        { validateResult: false },
      );
      const quotes = (resp?.quotes ?? []) as Array<{
        symbol?: string;
        quoteType?: string;
        exchange?: string;
      }>;
      // Prefer: (1) US exchange, (2) symbol without dot (US tickers rarely have dots),
      // (3) any equity — fallback for foreign listings
      const usEquity = quotes.find(
        (q) => q.quoteType === "EQUITY" && q.exchange && US_EXCHANGES.has(q.exchange),
      );
      const noSuffixEquity = quotes.find(
        (q) => q.quoteType === "EQUITY" && q.symbol && !q.symbol.includes("."),
      );
      const anyEquity = quotes.find((q) => q.quoteType === "EQUITY");
      result.set(cusip, (usEquity ?? noSuffixEquity ?? anyEquity)?.symbol ?? null);
    } catch {
      result.set(cusip, null);
    }
    await sleep(250); // ~4 req/sec — polite to Yahoo Finance
  }

  return result;
}

async function resolveCusips(
  cusipNames: Map<string, string>,
): Promise<Map<string, string | null>> {
  const allCusips = [...cusipNames.keys()];
  const result = new Map<string, string | null>();
  if (allCusips.length === 0) return result;

  // Apply hardcoded overrides first (for CUSIPs whose SEC names are unfixable)
  const overrideRows: Array<{ cusip: string; ticker: string; source: string }> = [];
  for (const cusip of allCusips) {
    const override = CUSIP_TICKER_OVERRIDES[cusip];
    if (override) {
      result.set(cusip, override);
      overrideRows.push({ cusip, ticker: override, source: "override" });
    }
  }
  for (const row of overrideRows) {
    try {
      await db.insert(cusipTickerMapTable)
        .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
        .onConflictDoUpdate({ target: cusipTickerMapTable.cusip, set: { ticker: row.ticker, source: row.source } });
    } catch { /* ignore */ }
  }

  const cached = await db
    .select()
    .from(cusipTickerMapTable)
    .where(inArray(cusipTickerMapTable.cusip, allCusips));

  // Only treat *positive* ticker hits as cached — null (not_found) entries are retried
  for (const row of cached) {
    if (row.ticker !== null) result.set(row.cusip, row.ticker);
  }
  const uncachedMap = new Map<string, string>();
  for (const c of allCusips) {
    if (!result.has(c)) uncachedMap.set(c, cusipNames.get(c)!);
  }

  if (uncachedMap.size > 0) {
    const resolved = await resolveWithYahooSearch(uncachedMap);
    const rows = [...resolved.entries()].map(([cusip, ticker]) => ({
      cusip,
      ticker: ticker ?? null,
      source: ticker ? "yahoo_search" : "not_found",
    }));
    if (rows.length > 0) {
      for (const row of rows) {
        try {
          if (row.ticker) {
            // Positive result: upsert, overwriting any previous not_found entry
            await db
              .insert(cusipTickerMapTable)
              .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
              .onConflictDoUpdate({
                target: cusipTickerMapTable.cusip,
                set: { ticker: row.ticker, source: row.source },
              });
          } else {
            // Null result: only insert if not already there (never overwrite a good ticker)
            await db
              .insert(cusipTickerMapTable)
              .values({ cusip: row.cusip, ticker: null, source: "not_found" })
              .onConflictDoNothing();
          }
        } catch { /* ignore */ }
      }
    }
    resolved.forEach((ticker, cusip) => result.set(cusip, ticker));
  }

  return result;
}

// ─── Retry unresolved tickers for existing holdings ──────────────────────────

export async function retryUnresolvedTickers(cik: string): Promise<void> {
  // Collect distinct CUSIP + name pairs from this fund's holdings
  const rows = await db
    .select({ cusip: sec13fHoldingsTable.cusip, name: sec13fHoldingsTable.name })
    .from(sec13fHoldingsTable)
    .innerJoin(sec13fFilingsTable, eq(sec13fHoldingsTable.filingId, sec13fFilingsTable.id))
    .where(eq(sec13fFilingsTable.fundCik, cik));

  const cusipNames = new Map<string, string>();
  for (const row of rows) {
    if (!cusipNames.has(row.cusip)) cusipNames.set(row.cusip, row.name);
  }
  if (cusipNames.size === 0) return;

  logger.info({ cik, total: cusipNames.size }, "Retrying ticker resolution for existing holdings");

  // resolveCusips: uses positive-ticker cache hits, calls Yahoo Finance search for the rest
  await resolveCusips(cusipNames);

  // Push resolved tickers from cusip_ticker_map back into sec_13f_holdings.
  // Also fixes previously stored foreign tickers (containing '.') that were later overridden.
  const result = await db.execute(sql`
    UPDATE sec_13f_holdings
    SET ticker = m.ticker
    FROM cusip_ticker_map m
    WHERE sec_13f_holdings.cusip = m.cusip
      AND m.ticker IS NOT NULL
      AND (sec_13f_holdings.ticker IS NULL OR sec_13f_holdings.ticker LIKE '%.%')
  `);
  logger.info({ cik, updated: (result as { rowCount?: number }).rowCount ?? 0 }, "Ticker re-resolution complete");
}

// ─── EDGAR XML parsing ────────────────────────────────────────────────────────

interface RawHolding {
  name: string;
  cusip: string;
  marketValueThousands: number;
  shares: number;
}

function parseInfoTable(xml: string): { holdings: RawHolding[]; computedTotalThousands: number } {
  // Strip namespace prefixes so cheerio selectors work uniformly
  // e.g. <ns1:infoTable> → <infoTable>, </ns1:nameOfIssuer> → </nameOfIssuer>
  const cleanXml = xml.replace(/<(\/?)\s*\w+:/g, "<$1");
  const $ = cheerio.load(cleanXml, { xmlMode: true });
  const byName = new Map<string, RawHolding>();

  $("infoTable").each((_, el) => {
    const shPrn  = $(el).find("sshPrnamtType").text().trim().toUpperCase();
    const putCall = $(el).find("putCall").text().trim();
    if (shPrn !== "SH" || putCall !== "") return;

    const name   = $(el).find("nameOfIssuer").text().trim();
    const cusip  = $(el).find("cusip").text().trim();
    const value  = parseInt($(el).find("value").text().trim() || "0", 10);
    const shares = parseInt($(el).find("sshPrnamt").text().trim() || "0", 10);
    if (!name || !cusip) return;

    const existing = byName.get(name);
    if (existing) {
      existing.marketValueThousands += value;
      existing.shares += shares;
    } else {
      byName.set(name, { name, cusip, marketValueThousands: value, shares });
    }
  });

  const holdings = [...byName.values()];
  let computedTotalThousands = holdings.reduce((s, h) => s + h.marketValueThousands, 0);

  // Auto-detect dollar vs thousands units.
  // The 13F spec mandates thousands, but some filers (e.g. Himalaya) report raw dollars.
  // Heuristic: if the average per-holding value exceeds $10B (10,000,000 in thousands)
  // the filing used dollar units — divide every value by 1,000 to normalise.
  if (holdings.length > 0 && computedTotalThousands / holdings.length > 10_000_000) {
    for (const h of holdings) h.marketValueThousands = Math.round(h.marketValueThousands / 1000);
    computedTotalThousands = Math.round(computedTotalThousands / 1000);
  }

  return { holdings, computedTotalThousands };
}

function parsePrimaryDocTotal(xml: string): number | null {
  const $ = cheerio.load(xml, { xmlMode: true });
  const t = parseInt($("tableValueTotal").first().text().trim(), 10);
  return isNaN(t) ? null : t;
}

// ─── EDGAR full submission text parser ───────────────────────────────────────

interface SubmissionDocs {
  primaryXml: string | null;
  infotableXml: string | null;
}

/**
 * Parses the EDGAR full submission text file (the single .txt envelope
 * that packages all filing documents).  Each document lives in a
 * <DOCUMENT>…</DOCUMENT> block; the actual content is between <TEXT> and
 * </TEXT> and may be further wrapped in <XML>…</XML>.
 */
function parseSubmissionText(raw: string): SubmissionDocs {
  let primaryXml: string | null = null;
  let infotableXml: string | null = null;

  // Split on <DOCUMENT> markers (case-insensitive for safety)
  const blocks = raw.split(/<DOCUMENT>/i).slice(1); // first chunk is the header

  for (const block of blocks) {
    const type        = /^<TYPE>(.*)/im.exec(block)?.[1]?.trim() ?? "";
    const description = /^<DESCRIPTION>(.*)/im.exec(block)?.[1]?.trim().toUpperCase() ?? "";

    // Extract content between <TEXT>…</TEXT>
    const textMatch = /<TEXT>([\s\S]*?)<\/TEXT>/i.exec(block);
    if (!textMatch) continue;
    let content = textMatch[1].trim();

    // Strip <XML>…</XML> wrapper when present
    const xmlWrap = /^<XML>([\s\S]*?)<\/XML>\s*$/i.exec(content);
    if (xmlWrap) content = xmlWrap[1].trim();

    if (!content) continue;

    const isInfoTable = description.includes("INFORMATION TABLE")
      || content.includes("<informationTable")
      || content.includes(":informationTable"); // namespace-prefixed variant (e.g. ns1:informationTable)
    const isPrimary   = type === "13F-HR"
      && (content.includes("<edgarSubmission") || content.includes("<tableValueTotal"));

    // A single document can be both primary header and embedded info table
    // (newer filers like Himalaya put <ns1:informationTable> inside <edgarSubmission>)
    if (isInfoTable && !infotableXml) {
      infotableXml = content;
    }
    if (isPrimary && !primaryXml) {
      primaryXml = content;
    }
  }

  return { primaryXml, infotableXml };
}

// ─── EDGAR API helpers ────────────────────────────────────────────────────────

/** Fetches a URL from SEC EDGAR with exponential-backoff retry on 503. */
async function secFetch(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (res.status === 503 && attempt < 4) {
    const wait = [10_000, 20_000, 40_000, 60_000][attempt] ?? 60_000;
    logger.warn({ url, attempt, waitMs: wait }, "SEC EDGAR 503 — backing off");
    await sleep(wait);
    return secFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`SEC EDGAR fetch failed ${res.status}: ${url}`);
  return res;
}

interface SubmissionsData {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      reportDate: string[];
      filingDate: string[];
      primaryDocument: string[];
    };
  };
}

function padCik(cik: string): string {
  return cik.replace(/^0+/, "").padStart(10, "0");
}

async function fetch13fFilingStubs(
  cik: string,
): Promise<Array<{ accessionNumber: string; reportDate: string; filingDate: string }>> {
  const url = `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
  const res = await secFetch(url);
  const data = (await res.json()) as SubmissionsData;
  const { accessionNumber, form, reportDate, filingDate } = data.filings.recent;

  const stubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string }> = [];
  for (let i = 0; i < form.length; i++) {
    if (form[i] === "13F-HR" && reportDate[i]) {
      stubs.push({
        accessionNumber: accessionNumber[i]!,
        reportDate: reportDate[i]!,
        filingDate: filingDate[i]!,
      });
    }
  }
  return stubs;
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

/** Earliest report date to process — filings before this quarter are ignored. */
const MIN_REPORT_DATE = "2016-01-01"; // Q1 2016 and later only

/** Delay between consecutive filing fetches (SEC fair-access policy). */
const FETCH_DELAY_MS = 3_000;

/**
 * Longer delay used during gap-fill retries to be gentler on the CDN
 * after it has already rate-limited us once.
 */
const GAP_RETRY_DELAY_MS = 8_000;

export async function seedFundFilings(cik: string, linkedCiks: string[] = []): Promise<void> {
  logger.info({ cik, linkedCiks }, "Starting 13F filing seed");

  const fund = await db.select().from(hedgeFundsTable).where(eq(hedgeFundsTable.cik, cik)).limit(1);
  if (fund.length === 0) {
    logger.warn({ cik }, "Fund not found in hedge_funds table — aborting");
    return;
  }

  const existing = await db
    .select({ accessionNumber: sec13fFilingsTable.accessionNumber })
    .from(sec13fFilingsTable)
    .where(eq(sec13fFilingsTable.fundCik, cik));
  const existingSet = new Set(existing.map((r) => r.accessionNumber));

  // Gather stubs from the primary CIK
  let stubs;
  try {
    stubs = await fetch13fFilingStubs(cik);
  } catch (err) {
    logger.error({ err, cik }, "Failed to fetch EDGAR submissions");
    return;
  }

  // Also gather stubs from any linked CIKs (same fund, different legal entity over time),
  // tagging each with the fetch CIK so we use the right EDGAR URL.
  const allStubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string; fetchCik: string }> =
    stubs.map((s) => ({ ...s, fetchCik: cik }));

  for (const linkedCik of linkedCiks) {
    try {
      const linkedStubs = await fetch13fFilingStubs(linkedCik);
      for (const s of linkedStubs) allStubs.push({ ...s, fetchCik: linkedCik });
    } catch (err) {
      logger.error({ err, linkedCik }, "Failed to fetch linked CIK EDGAR submissions — skipping");
    }
  }

  const toProcess = allStubs
    .filter((s) => s.reportDate >= MIN_REPORT_DATE && !existingSet.has(s.accessionNumber));

  logger.info({ cik, total: allStubs.length, toProcess: toProcess.length }, "13F stubs found");

  for (const stub of toProcess) {
    try {
      await processFiling(stub.fetchCik, stub, cik /* storeCik */);
      await sleep(FETCH_DELAY_MS);
    } catch (err) {
      logger.warn({ err, cik, accession: stub.accessionNumber }, "Failed to process filing — skipping");
      await sleep(FETCH_DELAY_MS);
    }
  }

  logger.info({ cik, processed: toProcess.length }, "13F seed complete");
}

/**
 * Gap-fill pass: after the initial seed, some filings may have been skipped
 * due to transient SEC 503 errors.  This function identifies two categories
 * of gaps and retries them with a longer inter-request delay:
 *
 *   1. Stubs present on EDGAR but entirely absent from our DB.
 *   2. Filing rows already in our DB but with zero associated holdings
 *      (the filing insert succeeded but the holdings fetch failed).
 *
 * We use a longer delay (GAP_RETRY_DELAY_MS) between requests to be gentler
 * on the CDN after it has already rate-limited us during seeding.
 */
export async function retryGapFilings(cik: string): Promise<void> {
  logger.info({ cik }, "Starting gap-fill retry pass for missing/empty filings");

  // 1. Fetch the canonical list of stubs from EDGAR
  let stubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string }>;
  try {
    stubs = await fetch13fFilingStubs(cik);
  } catch (err) {
    logger.error({ err, cik }, "Gap-fill: failed to fetch EDGAR submission stubs");
    return;
  }

  // 2. Load all filing rows we have for this CIK
  const existingFilings = await db
    .select({ id: sec13fFilingsTable.id, accessionNumber: sec13fFilingsTable.accessionNumber })
    .from(sec13fFilingsTable)
    .where(eq(sec13fFilingsTable.fundCik, cik));

  const existingByAccession = new Map(existingFilings.map((f) => [f.accessionNumber, f.id]));

  // 3. Determine which filing IDs have at least one holding row
  const filingIds = existingFilings.map((f) => f.id);
  const filingIdsWithHoldings = new Set<number>();
  if (filingIds.length > 0) {
    const rows = await db
      .selectDistinct({ filingId: sec13fHoldingsTable.filingId })
      .from(sec13fHoldingsTable)
      .where(inArray(sec13fHoldingsTable.filingId, filingIds));
    for (const r of rows) filingIdsWithHoldings.add(r.filingId);
  }

  // 4. Build the gap list — stubs within the date window that are missing OR have empty holdings
  const gaps = stubs.filter((s) => {
    if (s.reportDate < MIN_REPORT_DATE) return false; // outside the historical cutoff
    const filingId = existingByAccession.get(s.accessionNumber);
    if (filingId === undefined) return true;          // category 1: not in DB at all
    return !filingIdsWithHoldings.has(filingId);      // category 2: in DB but no holdings
  });

  if (gaps.length === 0) {
    logger.info({ cik }, "Gap-fill: no missing or empty filings found — nothing to retry");
    return;
  }

  logger.info({ cik, gaps: gaps.length }, "Gap-fill: retrying filings with missing/empty holdings");

  let recovered = 0;
  for (const stub of gaps) {
    try {
      await processFiling(cik, stub);
      recovered++;
      logger.info(
        { cik, accession: stub.accessionNumber, period: reportDateToQuarter(stub.reportDate) },
        "Gap-fill: filing recovered",
      );
    } catch (err) {
      logger.warn(
        { err, cik, accession: stub.accessionNumber },
        "Gap-fill: filing still failed after retry — will try again on next refresh",
      );
    }
    // Always wait between requests, even after failures, to stay within SEC rate limits
    await sleep(GAP_RETRY_DELAY_MS);
  }

  logger.info({ cik, recovered, totalGaps: gaps.length }, "Gap-fill retry pass complete");
}

async function processFiling(
  cik: string,
  stub: { accessionNumber: string; reportDate: string; filingDate: string },
  storeCik?: string, // CIK used for DB storage — defaults to cik (used when a fund changed legal entity)
): Promise<void> {
  const fundCikForDb = storeCik ?? cik;
  const periodLabel = reportDateToQuarter(stub.reportDate);
  logger.info({ cik, storeCik: fundCikForDb, period: periodLabel }, "Processing 13F filing");

  // Fetch the full submission text file — one request gets ALL documents
  const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${stub.accessionNumber}.txt`;
  const res = await secFetch(txtUrl);
  const raw = await res.text();

  const { primaryXml, infotableXml } = parseSubmissionText(raw);

  if (!infotableXml) {
    logger.warn({ cik, period: periodLabel }, "Could not locate infotable in submission — skipping");
    return;
  }

  const { holdings, computedTotalThousands } = parseInfoTable(infotableXml);

  let totalValueThousands = computedTotalThousands;
  if (primaryXml) {
    const headerTotal = parsePrimaryDocTotal(primaryXml);
    if (headerTotal && headerTotal > 0) {
      // Guard against dollar-unit filings where the header total is ~1000x our
      // already-normalised computedTotalThousands (same auto-detection as parseInfoTable).
      const ratio = computedTotalThousands > 0 ? headerTotal / computedTotalThousands : 0;
      totalValueThousands = (ratio > 500 && ratio < 2000)
        ? Math.round(headerTotal / 1000)
        : headerTotal;
    }
  }

  if (holdings.length === 0) {
    logger.warn({ cik, period: periodLabel }, "No SH holdings found — skipping");
    return;
  }

  // Resolve CUSIPs → tickers (pass names so Yahoo Finance search can be used)
  const tickerMap = await resolveCusips(new Map(holdings.map((h) => [h.cusip, h.name])));

  // Upsert filing record
  const [filing] = await db
    .insert(sec13fFilingsTable)
    .values({
      fundCik: fundCikForDb,
      periodLabel,
      reportDate: stub.reportDate,
      filingDate: stub.filingDate,
      accessionNumber: stub.accessionNumber,
      totalValueThousands,
    })
    .onConflictDoUpdate({
      target: sec13fFilingsTable.accessionNumber,
      set: { totalValueThousands },
    })
    .returning();

  if (!filing) {
    logger.error({ cik, period: periodLabel }, "Failed to upsert filing record");
    return;
  }

  // Upsert holdings in chunks
  const holdingRows = holdings.map((h) => ({
    filingId: filing.id,
    name: h.name,
    ticker: tickerMap.get(h.cusip) ?? null,
    cusip: h.cusip,
    marketValueThousands: h.marketValueThousands,
    shares: h.shares,
  }));

  const CHUNK = 50;
  for (let i = 0; i < holdingRows.length; i += CHUNK) {
    const chunk = holdingRows.slice(i, i + CHUNK);
    for (const row of chunk) {
      try {
        await db.insert(sec13fHoldingsTable).values(row).onConflictDoNothing();
      } catch { /* ignore */ }
    }
  }

  logger.info({ cik, period: periodLabel, holdings: holdings.length }, "13F filing processed");
}

// ─── Quarterly refresh scheduler ──────────────────────────────────────────────

/**
 * Returns true during the 13F filing window: days 25–46 after each quarter end.
 *
 * Quarter ends → approximate filing window:
 *   Q1 (Mar 31) → Apr 25 – May 19
 *   Q2 (Jun 30) → Jul 25 – Aug 18
 *   Q3 (Sep 30) → Oct 25 – Nov 18
 *   Q4 (Dec 31) → Jan 25 – Feb 18
 *
 * SEC deadline is 45 days; window extends to day 49 to catch late filers.
 * Polling every 3 days during this window gives ~9 checks per quarter.
 */
function isInFilingWindow(): boolean {
  const now   = new Date();
  const month = now.getUTCMonth() + 1; // 1-based
  const day   = now.getUTCDate();

  // (month, firstDay, lastDay) tuples for each quarter's filing window
  const windows: Array<[number, number, number]> = [
    [2,  1, 18],  // Q4 filing: Feb 1–18  (day 32–49 after Dec 31)
    [4, 25, 30],  // Q1 filing: Apr 25–30 (day 25–30 after Mar 31)
    [5,  1, 19],  // Q1 filing cont: May 1–19 (day 31–49 after Mar 31)
    [7, 25, 31],  // Q2 filing: Jul 25–31 (day 25–31 after Jun 30)
    [8,  1, 18],  // Q2 filing cont: Aug 1–18 (day 32–49 after Jun 30)
    [10, 25, 31], // Q3 filing: Oct 25–31 (day 25–31 after Sep 30)
    [11,  1, 18], // Q3 filing cont: Nov 1–18 (day 32–49 after Sep 30)
    [1,  25, 31], // Q4 filing: Jan 25–31 (day 25–31 after Dec 31)
  ];
  return windows.some(([m, from, to]) => month === m && day >= from && day <= to);
}

// Master list of tracked funds — add new entries here to register a fund.
// The startup sequence and the 12-hour scheduler iterate this list automatically.
const TRACKED_FUNDS = [
  { cik: "1067983", name: "Berkshire Hathaway",           slug: "berkshire-hathaway",      proprietor: "Warren Buffett"  },
  { cik: "1336528", name: "Pershing Square Capital Mgmt", slug: "pershing-square",         proprietor: "Bill Ackman"     },
  { cik: "1709323", name: "Himalaya Capital Management",  slug: "himalaya-capital",        proprietor: "Li Lu"           },
  { cik: "1766596", name: "RV Capital AG",                slug: "rv-capital",              proprietor: "Robert Vinall"   },
  { cik: "1697591", name: "CAS Investment Partners",      slug: "cas-investment-partners", proprietor: "Clifford Sosin"  },
  { cik: "1671657", name: "Dorsey Asset Management",      slug: "dorsey-asset-management", proprietor: "Pat Dorsey"      },
  { cik: "905567",  name: "Yacktman Asset Management",   slug: "yacktman-asset-management", proprietor: "Donald Yacktman" },
  { cik: "732905",  name: "Tweedy Browne Co LLC",        slug: "tweedy-browne",             proprietor: "William Browne"   },
  { cik: "1036325", name: "Davis Selected Advisers",    slug: "davis-selected-advisers",   proprietor: "Christopher Davis" },
  { cik: "1358706", name: "Abrams Capital Management", slug: "abrams-capital",             proprietor: "David Abrams"      },
  { cik: "1061768", name: "Baupost Group",              slug: "baupost-group",              proprietor: "Seth Klarman"      },
  { cik: "1375534", name: "Generation Investment Mgmt", slug: "generation-investment",       proprietor: "Al Gore"           },
  { cik: "1112520", name: "Akre Capital Management",   slug: "akre-capital",                proprietor: "Chuck Akre"        },
  { cik: "1656456", name: "Appaloosa LP",              slug: "appaloosa",                   proprietor: "David Tepper"      },
  { cik: "1720792", name: "Ruane, Cunniff & Goldfarb", slug: "ruane-cunniff",               proprietor: "David Poppe"       },
  { cik: "1569205", name: "FundSmith LLP",             slug: "fundsmith",                   proprietor: "Terry Smith"        },
  { cik: "1647251", name: "TCI Fund Management",       slug: "tci-fund-management",          proprietor: "Christopher Hohn"  },
  { cik: "1167483", name: "Tiger Global Management",   slug: "tiger-global",                  proprietor: "Chase Coleman"     },
  { cik: "915191",  name: "Fairfax Financial Holdings", slug: "fairfax-financial",             proprietor: "Prem Watsa"        },
  { cik: "1536411", name: "Duquesne Family Office",     slug: "duquesne-family-office",         proprietor: "Stanley Druckenmiller" },
  { cik: "1040273", name: "Third Point LLC",            slug: "third-point",                    proprietor: "Daniel Loeb"             },
  { cik: "921669",  name: "Icahn Capital LP",           slug: "icahn-capital",                  proprietor: "Carl Icahn"              },
  { cik: "1767640", name: "Public Investment Fund",    slug: "public-investment-fund",         proprietor: "Yasir Al-Rumayyan"       },
  { cik: "1263508", name: "Baker Bros. Advisors LP",  slug: "baker-bros-advisors",            proprietor: "Felix & Julian Baker"    },
  { cik: "1056831", name: "Fairholme Capital Mgmt",  slug: "fairholme-capital",              proprietor: "Bruce Berkowitz"         },
  // Greenlight Capital filed as "Greenlight Capital Inc" (CIK 1079114) through Q4 2023,
  // then switched to "DME Capital Management LP" (CIK 1489933) from Q1 2024 onwards.
  // linkedCik tells the seeder to fetch DME stubs but store them under the primary CIK.
  { cik: "1079114", name: "Greenlight Capital",      slug: "greenlight-capital",             proprietor: "David Einhorn",          linkedCik: "1489933" },
  { cik: "1035674", name: "Paulson & Co.",            slug: "paulson",                        proprietor: "John Paulson"            },
  { cik: "1103804", name: "Viking Global Investors",  slug: "viking-global",                  proprietor: "Andreas Halvorsen"       },
  { cik: "1135730", name: "Coatue Management",        slug: "coatue",                         proprietor: "Philippe Laffont"        },
  { cik: "1061165", name: "Lone Pine Capital",        slug: "lone-pine-capital",              proprietor: "Lee Ainslie"             },
  { cik: "1106500", name: "Joho Capital",             slug: "joho-capital",                   proprietor: "Robert Karr"             },
  { cik: "1345471", name: "Trian Fund Management",   slug: "trian-fund-management",          proprietor: "Nelson Peltz"            },
  { cik: "1553733", name: "Brave Warrior Advisors",  slug: "brave-warrior-advisors",         proprietor: "Glenn Greenberg"         },
  { cik: "1581811", name: "Egerton Capital",         slug: "egerton-capital",                proprietor: "John Armitage"           },
  { cik: "1034524", name: "Polen Capital Management", slug: "polen-capital",                  proprietor: "David Polen"              },
  { cik: "1404599", name: "Aquamarine Capital Management", slug: "aquamarine-capital",        proprietor: "Guy Spier"                },
];

export async function initEdgarFetcher(): Promise<void> {
  // Upsert all tracked funds into the DB (name/slug may change but CIK is stable)
  for (const fund of TRACKED_FUNDS) {
    await db
      .insert(hedgeFundsTable)
      .values(fund)
      .onConflictDoUpdate({
        target: hedgeFundsTable.cik,
        set: { name: fund.name, slug: fund.slug, proprietor: fund.proprietor },
      });
  }

  // Build a lookup of primary CIK → linked CIKs for funds that changed legal entity over time
  const linkedCikMap = new Map<string, string[]>();
  for (const entry of TRACKED_FUNDS) {
    if ("linkedCik" in entry && entry.linkedCik) {
      const existing = linkedCikMap.get(entry.cik) ?? [];
      existing.push(entry.linkedCik);
      linkedCikMap.set(entry.cik, existing);
    }
  }

  // Seed every fund on startup after a brief delay, then gap-fill and re-resolve
  // tickers for any holdings that had null tickers from prior runs.
  setTimeout(async () => {
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      const linkedCiks = linkedCikMap.get(fund.cik) ?? [];
      try {
        await seedFundFilings(fund.cik, linkedCiks);
      } catch (err) {
        logger.error({ err, cik: fund.cik }, "Initial 13F seed failed");
      }
      retryGapFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Initial gap-fill retry pass failed"),
      );
      retryUnresolvedTickers(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Initial ticker re-resolution failed"),
      );
    }
  }, 3_000);

  // Check every 3 days; only do real work during the ~6-week filing window
  // that follows each quarter end (~7 actual SEC queries per quarter per fund).
  setInterval(async () => {
    if (!isInFilingWindow()) {
      logger.info("13F refresh check: outside filing window, skipping");
      return;
    }
    logger.info("13F refresh check: inside filing window — refreshing all funds");
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      const linkedCiks = linkedCikMap.get(fund.cik) ?? [];
      try {
        await seedFundFilings(fund.cik, linkedCiks);
      } catch (err) {
        logger.error({ err, cik: fund.cik }, "Scheduled 13F refresh failed");
      }
      await retryGapFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Scheduled gap-fill retry pass failed"),
      );
    }
  }, 3 * 24 * 60 * 60 * 1000);

  logger.info("EDGAR fetcher initialized");
}
