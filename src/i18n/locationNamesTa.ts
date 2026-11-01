/**
 * Tamil display names for locations. DISPLAY ONLY: stored values, ids and API
 * values stay English; search/filtering keep using them.
 *
 * Only spellings that are standard and well known are listed. Anything not
 * listed falls back to the English name and is reported by
 * `missingTamilLocationNames()` for manual confirmation - no spelling is guessed.
 *
 * Keys are lower-cased, whitespace-collapsed English names (see normalizeKey).
 * Districts keep their own `nameTa` in tamilNaduData.ts.
 */

/** Taluk id -> Tamil (taluk ids are stable machine ids, see SALEM_TALUKS). */
export const TALUK_TA: Record<string, string> = {
  salem: 'சேலம்',
  'salem-west': 'சேலம் மேற்கு',
  'salem-south': 'சேலம் தெற்கு',
  yercaud: 'ஏற்காடு',
  gangavalli: 'கெங்கவல்லி',
  attur: 'ஆத்தூர்',
  pethanaickenpalayam: 'பெத்தநாயக்கன்பாளையம்',
  valapady: 'வாழப்பாடி',
  sankari: 'சங்ககிரி',
  edapadi: 'எடப்பாடி',
  mettur: 'மேட்டூர்',
  omalur: 'ஓமலூர்',
  kadayampatti: 'கடையாம்பட்டி',
};

/** English name (any town / area / locality / service area) -> Tamil. */
export const PLACE_TA: Record<string, string> = {
  // ---- towns & localities (TN_DISTRICTS[].towns) ----
  't. nagar': 'தி. நகர்', 'anna nagar': 'அண்ணா நகர்', velachery: 'வேளச்சேரி', tambaram: 'தாம்பரம்', adyar: 'அடையாறு',
  mylapore: 'மயிலாப்பூர்', guindy: 'கிண்டி', ambattur: 'அம்பத்தூர்', porur: 'போரூர்', perambur: 'பெரம்பூர்', avadi: 'ஆவடி',
  gandhipuram: 'காந்திபுரம்', 'rs puram': 'ஆர்.எஸ். புரம்', peelamedu: 'பீளமேடு', singanallur: 'சிங்காநல்லூர்',
  saravanampatti: 'சரவணம்பட்டி', 'saibaba colony': 'சாய்பாபா காலனி', kuniyamuthur: 'குனியமுத்தூர்', pollachi: 'பொள்ளாச்சி',
  'kk nagar': 'கே.கே. நகர்', sellur: 'செல்லூர்', simmakkal: 'சிம்மக்கல்', thirunagar: 'திருநகர்', goripalayam: 'கோரிப்பாளையம்',
  mattuthavani: 'மாட்டுத்தாவணி', othakadai: 'ஒத்தக்கடை', usilampatti: 'உசிலம்பட்டி', melur: 'மேலூர்',
  'thillai nagar': 'தில்லை நகர்', cantonment: 'கன்டோன்மென்ட்', srirangam: 'ஸ்ரீரங்கம்', ponmalai: 'பொன்மலை', kattur: 'காட்டூர்',
  lalgudi: 'லால்குடி', manapparai: 'மணப்பாறை',
  hasthampatti: 'ஹஸ்தம்பட்டி', fairlands: 'ஃபேர்லேண்ட்ஸ்', suramangalam: 'சூரமங்கலம்', ammapet: 'அம்மாபேட்டை', gugai: 'குகை',
  attur: 'ஆத்தூர்', mettur: 'மேட்டூர்',
  palayamkottai: 'பாளையங்கோட்டை', melapalayam: 'மேலப்பாளையம்', pettai: 'பேட்டை', thachanallur: 'தச்சநல்லூர்', ambasamudram: 'அம்பாசமுத்திரம்',
  palladam: 'பல்லடம்', udumalaipettai: 'உடுமலைப்பேட்டை', kangeyam: 'காங்கேயம்', dharapuram: 'தாராபுரம்',
  perundurai: 'பெருந்துறை', bhavani: 'பவானி', gobichettipalayam: 'கோபிச்செட்டிபாளையம்', sathyamangalam: 'சத்தியமங்கலம்', modakurichi: 'மொடக்குறிச்சி',
  katpadi: 'காட்பாடி', sathuvachari: 'சத்துவாச்சாரி', bagayam: 'பாகாயம்', gudiyatham: 'குடியாத்தம்', anaicut: 'அணைக்கட்டு',
  kumbakonam: 'கும்பகோணம்', pattukkottai: 'பட்டுக்கோட்டை', papanasam: 'பாபநாசம்',
  palani: 'பழனி', kodaikanal: 'கொடைக்கானல்', natham: 'நத்தம்', oddanchatram: 'ஒட்டன்சத்திரம்', begambur: 'பேகம்பூர்',
  nagercoil: 'நாகர்கோவில்', marthandam: 'மார்த்தாண்டம்', thuckalay: 'தக்கலை', colachel: 'குளச்சல்',
  'bryant nagar': 'பிரையன்ட் நகர்', millerpuram: 'மில்லர்புரம்', kovilpatti: 'கோவில்பட்டி', tiruchendur: 'திருச்செந்தூர்', srivaikuntam: 'ஸ்ரீவைகுண்டம்',
  manjakuppam: 'மஞ்சக்குப்பம்', chidambaram: 'சிதம்பரம்', panruti: 'பண்ருட்டி', vridhachalam: 'விருத்தாசலம்', neyveli: 'நெய்வேலி',
  sriperumbudur: 'ஸ்ரீபெரும்புதூர்', walajabad: 'வாலாஜாபாத்', uthiramerur: 'உத்திரமேரூர்',
  poonamallee: 'பூந்தமல்லி', tiruttani: 'திருத்தணி', gummidipoondi: 'கும்மிடிப்பூண்டி',
  mahabalipuram: 'மகாபலிபுரம்', guduvanchery: 'கூடுவாஞ்சேரி', 'maraimalai nagar': 'மறைமலை நகர்', maduranthakam: 'மதுராந்தகம்',
  harur: 'அரூர்', palacode: 'பாலக்கோடு', pennagaram: 'பென்னாகரம்',
  hosur: 'ஓசூர்', pochampalli: 'போச்சம்பள்ளி', bargur: 'பர்கூர்',
  tiruchengode: 'திருச்செங்கோடு', rasipuram: 'ராசிபுரம்', 'paramathi velur': 'பரமத்தி வேலூர்',
  'udhagamandalam (ooty)': 'உதகமண்டலம் (ஊட்டி)', coonoor: 'குன்னூர்', kotagiri: 'கோத்தகிரி', gudalur: 'கூடலூர்',
  kulithalai: 'குளித்தலை', aravakurichi: 'அரவக்குறிச்சி', kunnam: 'குன்னம்', veppanthattai: 'வேப்பந்தட்டை',
  jayankondam: 'ஜெயங்கொண்டம்', sendurai: 'செந்துறை', velankanni: 'வேளாங்கண்ணி', vedaranyam: 'வேதாரண்யம்',
  sirkazhi: 'சீர்காழி', tharangambadi: 'தரங்கம்பாடி', mannargudi: 'மன்னார்குடி', thiruthuraipoondi: 'திருத்துறைப்பூண்டி',
  aranthangi: 'அறந்தாங்கி', alangudi: 'ஆலங்குடி', illuppur: 'இலுப்பூர்',
  karaikudi: 'காரைக்குடி', devakottai: 'தேவகோட்டை', manamadurai: 'மானாமதுரை',
  rameswaram: 'ராமேஸ்வரம்', paramakudi: 'பரமக்குடி', kilakarai: 'கீழக்கரை',
  sivakasi: 'சிவகாசி', rajapalayam: 'ராஜபாளையம்', srivilliputhur: 'ஸ்ரீவில்லிபுத்தூர்', aruppukkottai: 'அருப்புக்கோட்டை',
  courtallam: 'குற்றாலம்', sankarankovil: 'சங்கரன்கோவில்', kadayanallur: 'கடையநல்லூர்',
  periyakulam: 'பெரியகுளம்', bodinayakanur: 'போடிநாயக்கனூர்', cumbum: 'கம்பம்',
  walaja: 'வாலாஜா', arcot: 'ஆற்காடு', arakkonam: 'அரக்கோணம்',
  ambur: 'ஆம்பூர்', vaniyambadi: 'வாணியம்பாடி', natrampalli: 'நாட்றம்பள்ளி',
  ulundurpet: 'உளுந்தூர்பேட்டை', sankarapuram: 'சங்கராபுரம்', chinnasalem: 'சின்னசேலம்',
  tindivanam: 'திண்டிவனம்', gingee: 'செஞ்சி', marakkanam: 'மரக்காணம்',
  arani: 'ஆரணி', polur: 'போளூர்', chengam: 'செங்கம்', cheyyar: 'செய்யாறு',

  town: 'டவுன்', junction: 'ஜங்ஷன்', 'avinashi road': 'அவினாசி சாலை', 'kumaran road': 'குமரன் சாலை',
  'medical college road': 'மருத்துவக் கல்லூரி சாலை', 'old bus stand': 'பழைய பேருந்து நிலையம்', 'palani road': 'பழனி சாலை', 'gandhi road': 'காந்தி சாலை',

  // ---- Salem taluk areas (provisional list): only well-known spellings ----
  salem: 'சேலம்', valasaiyur: 'வலசையூர்', mallur: 'மல்லூர்', karipatti: 'காரிப்பட்டி',
  alagapuram: 'அழகாபுரம்', thirumalaigiri: 'திருமலைகிரி', erumapalayam: 'எருமாபாளையம்', sanyasigundu: 'சன்னியாசிகுண்டு',
  kondalampatti: 'கொண்டலாம்பட்டி', veerapandi: 'வீரபாண்டி', elampillai: 'இளம்பிள்ளை',
  yercaud: 'ஏற்காடு', maramangalam: 'மரமங்கலம்', nagalur: 'நாகலூர்',
  valapady: 'வாழப்பாடி', malliakarai: 'மல்லியக்கரை', pethanaickenpalayam: 'பெத்தநாயக்கன்பாளையம்',
  gangavalli: 'கெங்கவல்லி', pachamalai: 'பச்சமலை',
  sankari: 'சங்ககிரி', devur: 'தேவூர்',
  edappadi: 'எடப்பாடி', konganapuram: 'கொங்கணாபுரம்', poolampatti: 'பூலாம்பட்டி',
  kolathur: 'கொளத்தூர்', palamalai: 'பாலமலை', nangavalli: 'நங்கவள்ளி', mecheri: 'மேச்சேரி',
  omalur: 'ஓமலூர்', taramangalam: 'தாரமங்கலம்', karuppur: 'கருப்பூர்',
  kadayampatti: 'கடையாம்பட்டி', danishpet: 'டேனிஷ்பேட்டை',
};

/**
 * Area / village names whose Tamil spelling was TRANSLITERATED from the standard English romanisation
 * (patti = பட்டி, palayam = பாளையம், pudur = புதூர், ...) rather than copied from an official Tamil list.
 * They are shown in Tamil mode, but every entry still needs a native-speaker / official-source check
 * (see docs/LOCATION_TAMIL_NAMES.md). Fix a spelling by editing it here; the display updates everywhere.
 */
export const PLACE_TA_TRANSLITERATED: Record<string, string> = {
  'panamarathupatti': 'பனமரத்துப்பட்டி', 'veeranam': 'வீராணம்', 'ayothiapattinam': 'அயோத்தியாப்பட்டணம்',
  'minnampalli': 'மின்னாம்பள்ளி', 'udayapatti': 'உடையாப்பட்டி', 'kuppanur': 'குப்பனூர்',
  'veeraganur': 'வீரகனூர்', 'nilavarapatti': 'நிலவாரப்பட்டி', 'sukkampatti': 'சுக்கம்பட்டி',
  'achankuttapatti': 'அச்சங்குட்டப்பட்டி', 'dasanaickenpatti': 'தாசநாயக்கன்பட்டி', 'chettichavadi': 'செட்டிச்சாவடி',
  'inamvedugathampatti': 'இனாம் வேடுகாத்தாம்பட்டி', 'mallamooppampatti': 'மல்லமூப்பம்பட்டி', 'sarkargollapatti': 'சர்க்கார் கொல்லப்பட்டி',
  'selathampatti': 'சேலத்தாம்பட்டி', 'kondappanaickenpatti': 'கொண்டப்பநாயக்கன்பட்டி', 'vattamuthampatti': 'வட்டமுத்தாம்பட்டி',
  'majaragollapatti': 'மஜராகொல்லப்பட்டி', 'perumampatti': 'பெருமாம்பட்டி', 'puthur agraharam': 'புதூர் அக்ரஹாரம்',
  'vembadithalam': 'வேம்படிதாளம்', 'attayampatti': 'அட்டையாம்பட்டி', 'poolavari': 'பூலாவரி',
  'rakkipatti': 'ராக்கிப்பட்டி', 'uthamasolapuram': 'உத்தமசோழபுரம்', 'papparapatti': 'பாப்பாரப்பட்டி',
  'marulayampalayam': 'மருளையாம்பாளையம்', 'perumagoundampatti': 'பெருமாகவுண்டம்பட்டி', 'chennagiri': 'சென்னகிரி',
  'kalparapatti': 'கல்பாரப்பட்டி', 'anaikuttapatti': 'ஆனைக்குட்டப்பட்டி', 'senaipalayam': 'சேனைப்பாளையம்',
  'manjakuttai': 'மஞ்சக்குட்டை', 'semmanatham': 'செம்மநத்தம்', 'thalaisolai': 'தலைச்சோலை',
  'vazhavanthi': 'வாழவந்தி', 'vellakkadai': 'வெள்ளக்கடை', 'velur': 'வேலூர்',
  'puthur': 'புதூர்', 'kottachedu': 'கொட்டச்சேடு', 'kiliyur': 'கிளியூர்',
  'pakoda point area': 'பகோடா பாயின்ட் பகுதி', 'lady\'s seat area': 'லேடீஸ் சீட் பகுதி', 'yercaud lake area': 'ஏற்காடு ஏரி பகுதி',
  'belur': 'பேளூர்', 'arunuthumalai': 'அருநூற்றுமலை', 'athanurpatti': 'அத்தனூர்பட்டி',
  'chandrapillaivalasu': 'சந்திரபிள்ளைவலசு', 'chinnamanaickenpalayam': 'சின்னமநாயக்கன்பாளையம்', 'kattuveppilaipatti': 'காட்டுவேப்பிலைப்பட்டி',
  'kolathukombai': 'கொளத்துக்கொம்பை', 'kurichi': 'குறிச்சி', 'mannarpalayam': 'மன்னார்பாளையம்',
  'muthampatti': 'முத்தம்பட்டி', 'neermullikuttai': 'நீர்முள்ளிக்குட்டை', 'ponnarampatti': 'பொன்னாரம்பட்டி',
  'singipuram': 'சிங்கிபுரம்', 'ammampalayam': 'அம்மம்பாளையம்', 'appamasamudram': 'அப்பமசமுத்திரம்',
  'arasanatham': 'அரசநத்தம்', 'chokkanathapuram': 'சொக்கநாதபுரம்', 'eachampatty': 'ஈச்சம்பட்டி',
  'kallanatham': 'கள்ளநத்தம்', 'kalpaganur': 'கல்பகனூர்', 'koolamedu': 'கூலமேடு',
  'kothampadi': 'கொத்தாம்பாடி', 'manjini': 'மஞ்சினி', 'paithur': 'பைத்தூர்',
  'pungavadi': 'புங்கவாடி', 'thandavarayapuram': 'தாண்டவராயபுரம்', 'ethapur': 'ஏத்தாப்பூர்',
  'kottavadi': 'கோட்டவாடி', 'puthiragoundampalayam': 'புத்திரகவுண்டம்பாளையம்', 'thumbal': 'தும்பல்',
  'panamadal': 'பனமடல்', 'oddapatti': 'ஒட்டப்பட்டி', 'olappadi': 'ஓலப்பாடி',
  'sekkadipatti': 'செக்கடிப்பட்டி', 'thamayanur': 'தாமையனூர்', 'thandanur': 'தாண்டனூர்',
  'umayalpuram': 'உமையாள்புரம்', 'vadugathampatti': 'வடுகத்தாம்பட்டி', 'veeragoundanoor': 'வீரகவுண்டனூர்',
  'west rajapalayam': 'மேற்கு ராஜபாளையம்', 'anaiyampatti': 'ஆனையம்பட்டி', 'goodamalai': 'கூடமலை',
  'jangamasamudram': 'ஜங்கமசமுத்திரம்', 'kadambur': 'கடம்பூர்', 'kondayampalli': 'கொண்டையம்பள்ளி',
  'krishnapuram': 'கிருஷ்ணபுரம்', 'manmalai': 'மண்மலை', 'naduvalur': 'நடுவலூர்',
  'nagiyampatti': 'நாகியம்பட்டி', 'odiyathur': 'ஒடியத்தூர்', 'thagarapudur': 'தகரப்புதூர்',
  'ulipuram': 'உலிபுரம்', 'sankari east': 'சங்ககிரி கிழக்கு', 'sankari west': 'சங்ககிரி மேற்கு',
  'ernapuram': 'எர்ணாபுரம்', 'alathur': 'ஆலத்தூர்', 'annathanapatti': 'அன்னதானப்பட்டி',
  'chinnagoundanur': 'சின்னகவுண்டனூர்', 'devannagoundanur': 'தேவண்ணகவுண்டனூர்', 'irugalur': 'இருகாலூர்',
  'iveli': 'ஐவேலி', 'katheri': 'கத்தேரி', 'kaveripatti': 'காவேரிப்பட்டி',
  'koneripatti': 'கோனேரிப்பட்டி', 'morur east': 'மோரூர் கிழக்கு', 'morur west': 'மோரூர் மேற்கு',
  'mottaianur': 'மொட்டையனூர்', 'pullagoundampatti': 'புள்ளகவுண்டம்பட்டி', 'sanyasipatti agraharam': 'சன்னியாசிப்பட்டி அக்ரஹாரம்',
  'vaikundam': 'வைகுந்தம்', 'veerachipalayam': 'வீராச்சிபாளையம்', 'vadugapatti': 'வடுகப்பட்டி',
  'adaiyur': 'அடையூர்', 'avaniperur east': 'அவனிபேரூர் கிழக்கு', 'chettimankurichi': 'செட்டிமாங்குறிச்சி',
  'chithoor': 'சித்தூர்', 'dadhapuram': 'தாதாபுரம்', 'iruppali': 'இருப்பாளி',
  'nedungulam': 'நெடுங்குளம்', 'pakkanadu': 'பக்கநாடு', 'vellarivelli': 'வெள்ளரிவெள்ளி',
  'vembaneri': 'வேம்பனேரி', 'erumaipatti': 'எருமைப்பட்டி', 'katchupalli': 'கச்சுப்பள்ளி',
  'konasamudram': 'கோனசமுத்திரம்', 'koranampatti': 'கோரணம்பட்டி', 'kurumbapatti': 'குறும்பப்பட்டி',
  'pudupalayam': 'புதுப்பாளையம்', 'samudram': 'சமுத்திரம்', 'pottaneri': 'பொட்டனேரி',
  'alamarathupatti': 'ஆலமரத்துப்பட்டி', 'chithiraipattipudur': 'சித்திரைப்பட்டிபுதூர்', 'dhinnaipatti': 'திண்ணைப்பட்டி',
  'kannamoochi': 'கண்ணாமூச்சி', 'karungallur': 'கருங்கல்லூர்', 'kaveripuram': 'காவேரிபுரம்',
  'kolnaickenpatti': 'கொல்நாயக்கன்பட்டி', 'lakkampatti': 'லக்கம்பட்டி', 'moolakkadu': 'மூலக்காடு',
  'navapatti': 'நவப்பட்டி', 'pannavadi': 'பண்ணவாடி', 'sampalli': 'சம்பள்ளி',
  'singiripatti': 'சிங்கிரிப்பட்டி', 'koonandiyur': 'கூனாண்டியூர்', 'virudasampatti': 'விருதாசம்பட்டி',
  'balbakki': 'பல்பாக்கி', 'ettikuttapatti': 'எட்டிக்குட்டப்பட்டி', 'gollapatti': 'கொல்லப்பட்டி',
  'kamalapuram': 'கமலாபுரம்', 'kottagoundampatti': 'கோட்டகவுண்டம்பட்டி', 'kottamettupatti': 'கோட்டமேட்டுப்பட்டி',
  'm. chettipatti': 'எம். செட்டிப்பட்டி', 'manguppai': 'மாங்குப்பை', 'moogilpadi': 'மூக்கில்பாடி',
  'muthunaickenpatti': 'முத்துநாயக்கன்பட்டி', 'nallagoundampatti': 'நல்லகவுண்டம்பட்டி', 'naranampalayam': 'நாரணம்பாளையம்',
  'pachanampatti': 'பச்சனம்பட்டி', 'pagalpatti': 'பகல்பட்டி', 'periyeripatti': 'பெரியேரிப்பட்டி',
  'pottipuram': 'பொட்டிபுரம்', 'tholasampatti': 'தொளசம்பட்டி', 'semmandapatti': 'செம்மண்டப்பட்டி',
  'bommiampatti': 'பொம்மியம்பட்டி', 'deevattipatti': 'தீவட்டிப்பட்டி', 'gundakkal': 'குண்டக்கல்',
  'kanavaipudur': 'கணவாய்புதூர்', 'kanjanaickenpatti': 'காஞ்சநாயக்கன்பட்டி', 'karuvalli': 'கருவள்ளி',
  'kongupatti': 'கொங்குப்பட்டி', 'kookkuttapatti': 'கூக்குட்டப்பட்டி', 'mookkanur': 'மூக்கனூர்',
  'nadupatti': 'நடுப்பட்டி', 'pannapatti': 'பன்னப்பட்டி', 'poosaripatti': 'பூசாரிப்பட்டி',
  'umbilikkampatti': 'உம்பிளிக்கம்பட்டி', 'veppilai': 'வேப்பிலை',
};

/** "<District> Town" entries are shown as "<district Tamil name> நகரம்". */
export const TOWN_SUFFIX_TA = 'நகரம்';
