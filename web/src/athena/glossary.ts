import { isAr } from '../i18n'

/*
 * Athena's knowledge base: the Nashr glossary the owner wrote (Athena knowledge base: Nashr glossary, 26 Nov 2026).
 * Athena answers "what is…" / "what does … mean" / "ما معنى…" from it, word for word, in the person's language.
 * Each entry: the word as people see it on screen (English and Arabic), other names people use, what it means, and an example.
 * Calendar has one meaning for buyers and another for publishers (`roles`). Nothing here is a number from someone's account.
 */
export type Term = { en: string; ar: string; also?: string[]; def: [string, string]; ex?: [string, string]; roles?: ('buyer' | 'seller' | 'admin')[]; go?: { href: string; label: [string, string] } }

export const GLOSSARY: Term[] = [
  { en: 'Accepted, pay now', ar: 'مقبول، ادفع الآن', also: ['accepted', 'pay now', 'مقبول'], def: ['Status: the seller accepted the bid. The buyer now pays to secure it.', 'حالة: قبل الناشر العرض. على المشتري الآن الدفع لتأمين الحجز.'] },
  { en: 'Added', ar: 'مضاف', def: ['Status: a product is in a campaign but no bid has been placed yet.', 'حالة: المنتج موجود في الحملة لكن لم يُقدَّم عليه عرض بعد.'] },
  { en: 'Athena', ar: 'أثينا', def: ['Nashr\'s AI assistant. Helps buyers search and plan campaigns, and sellers fill in products from a media kit. Never bids or publishes by itself.', 'مساعدة نشر الذكية. تساعد المشترين على البحث وتخطيط الحملات، وتساعد الناشرين على تعبئة المنتجات من ملف الوسيلة. لا تقدّم عروضًا ولا تنشر من تلقاء نفسها.'] },
  { en: 'Auction', ar: 'مزاد', def: ['A sale type. Buyers bid; when bidding closes, the seller accepts or declines the highest bid.', 'طريقة بيع. يقدّم المشترون عروضهم، وعند انتهاء المزايدة يقبل الناشر أعلى عرض أو يرفضه.'] },
  { en: 'Audience', ar: 'الجمهور', def: ['Who a product reaches, written by the seller on the product\'s Audience tab.', 'من يصل إليهم المنتج، كما كتبه الناشر في تبويب الجمهور للمنتج.'], ex: ['Business commuters, 25–45', 'موظفون في طريقهم للعمل، 25–45'] },
  { en: 'Bid', ar: 'عرض', also: ['bids', 'bidding', 'مزايدة'], def: ['An amount a buyer offers for a listing. Also the button on auction products.', 'مبلغ يعرضه المشتري على موعد معروض. وهو أيضًا زر منتجات المزاد.'] },
  { en: 'Bid drawer', ar: 'نافذة العرض', also: ['bid panel', 'drawer'], def: ['The panel where a buyer places a bid, request or offer, with their brief and creative.', 'اللوحة التي يقدّم فيها المشتري عرضه أو طلبه، مع الملخص والمادة الإعلانية.'] },
  { en: 'Bidding closes', ar: 'تنتهي المزايدة', also: ['closes', 'closing', 'close date', 'يغلق', 'إغلاق المزايدة'], def: ['When a listing stops taking bids. Set by the seller in days before the listing runs. Always at least 3 days before Creative due.', 'وقت توقف الموعد عن استقبال العروض. يحدده الناشر بعدد الأيام قبل موعد العرض، ودائمًا قبل موعد تسليم المادة الإعلانية بثلاثة أيام على الأقل.'] },
  { en: 'Brief', ar: 'ملخص الإعلان', also: ['الملخص'], def: ['What the ad is about: advertiser or brand, industry, what the ad will say, creative language, and any disclaimer or licence number.', 'عمّا يتحدث الإعلان: المعلن أو العلامة التجارية، والقطاع، وما سيقوله الإعلان، ولغة المادة، وأي إخلاء مسؤولية أو رقم ترخيص.'] },
  { en: 'Buy', ar: 'اشترِ', def: ['The button on fixed price products.', 'زر منتجات السعر الثابت.'] },
  { en: 'Buy now', ar: 'اشترِ الآن', def: ['Optional on an auction. The buyer can request the listing at this price instead of bidding. The seller still accepts or declines.', 'خيار اختياري في المزاد. يمكن للمشتري طلب الموعد بهذا السعر بدل المزايدة، ويبقى للناشر القبول أو الرفض.'], ex: ['Request at AED 5,500', 'اطلب بسعر 5,500 درهم'] },
  { en: 'Buyer', ar: 'مشترٍ', also: ['buyers', 'advertiser', 'مشتري', 'معلن'], def: ['A company that buys media on Nashr: a brand, agency or PR team.', 'شركة تشتري الإعلانات على نشر: علامة تجارية أو وكالة أو فريق علاقات عامة.'], ex: ['Northwind Fintech', 'Northwind Fintech'] },
  { en: 'Calendar', ar: 'التقويم', roles: ['buyer', 'admin'], def: ['The buyer\'s planner and tracker. Shows only the buyer\'s own items and their status.', 'مخطط المشتري ومتابعته. يعرض عناصر المشتري فقط وحالتها.'], go: { href: '/calendar', label: ['Open my Calendar', 'افتح التقويم'] } },
  { en: 'Calendar', ar: 'التقويم', roles: ['seller'], def: ['Where a seller puts products on sale for dates and sees bids.', 'حيث يعرض الناشر منتجاته للبيع في مواعيد ويرى العروض.'], go: { href: '/schedule', label: ['Open my Calendar', 'افتح التقويم'] } },
  { en: 'Campaign', ar: 'حملة', also: ['campaigns', 'حملات'], def: ['Optional. A buyer\'s plan: products, dates, budget and one brief sent with every bid.', 'اختيارية. خطة المشتري: المنتجات والمواعيد والميزانية وملخص واحد يُرسل مع كل عرض.'], ex: ['Q4 card launch', 'إطلاق بطاقة الربع الرابع'] },
  { en: 'Check availability', ar: 'تحقق من التوفر', def: ['Button on outlet cards and product rows that opens the outlet\'s calendar.', 'زر في بطاقات المنافذ وصفوف المنتجات يفتح تقويم المنفذ.'] },
  { en: 'Client', ar: 'عميل', also: ['clients', 'عملاء'], def: ['Optional. A company an agency books for. Keeps its bookings, receipts and reports together.', 'اختياري. شركة تحجز لها الوكالة، وتُجمع حجوزاتها وإيصالاتها وتقاريرها معًا.'] },
  { en: 'Close match', ar: 'تطابق قريب', def: ['A product just outside the reach range a buyer typed (within 2,000 or 2%, whichever is bigger).', 'منتج خارج نطاق الوصول الذي كتبه المشتري بقليل (ضمن 2,000 أو 2%، أيهما أكبر).'] },
  { en: 'Closed', ar: 'مغلق', def: ['A date where bidding has ended or nothing is on sale.', 'موعد انتهت فيه المزايدة أو لا يُعرض فيه شيء للبيع.'] },
  { en: 'Committed', ar: 'ملتزم به', def: ['In a campaign: what\'s accepted, paid or ran. Open bids don\'t count.', 'في الحملة: ما تم قبوله أو دفعه أو عرضه. العروض المفتوحة لا تُحتسب.'] },
  { en: 'Completed', ar: 'مكتمل', def: ['Status: the buyer approved the proof. The booking is finished.', 'حالة: وافق المشتري على الإثبات، واكتمل الحجز.'] },
  { en: 'Creative', ar: 'المادة الإعلانية', also: ['artwork', 'ad file', 'تصميم'], def: ['The ad itself: the file (image, audio, video, text). Required with every bid.', 'الإعلان نفسه: الملف (صورة أو صوت أو فيديو أو نص). مطلوب مع كل عرض.'] },
  { en: 'Creative due', ar: 'موعد تسليم المادة', def: ['The seller\'s deadline for creative, in days before the listing runs. Creative already goes with the bid.', 'آخر موعد يحدده الناشر لاستلام المادة الإعلانية، بعدد الأيام قبل موعد العرض. والمادة تُرسل أصلًا مع العرض.'] },
  { en: 'Default price', ar: 'السعر الافتراضي', def: ['The price a seller sets on a product. Fills in the starting price when they list it.', 'السعر الذي يضعه الناشر على المنتج، ويُملأ به سعر البداية عند عرضه للبيع.'] },
  { en: 'Directory', ar: 'الدليل', def: ['Where buyers find and buy media. Two views: Outlets and Products.', 'حيث يجد المشترون الإعلانات ويشترونها. فيه عرضان: المنافذ والمنتجات.'], go: { href: '/directory', label: ['Open the Directory', 'افتح الدليل'] } },
  { en: 'Edit for this bid', ar: 'تعديل لهذا العرض', def: ['Changes the brief or creative for one bid only. The campaign stays the same.', 'يغيّر الملخص أو المادة الإعلانية لعرض واحد فقط، وتبقى الحملة كما هي.'] },
  { en: 'Estimated', ar: 'تقديري', def: ['In a campaign: products added but not bid on yet, at their listed price.', 'في الحملة: منتجات مضافة لم يُقدَّم عليها عرض بعد، بسعرها المعروض.'] },
  { en: 'Fixed price', ar: 'سعر ثابت', def: ['A sale type. The price is set. Several buyers can offer at that price; the seller picks one.', 'طريقة بيع بسعر محدد. يمكن لعدة مشترين الطلب بهذا السعر، ويختار الناشر واحدًا منهم.'] },
  { en: 'Inbox', ar: 'الوارد', def: ['Messages and things to do: pay now, check proof, accept or decline.', 'الرسائل والمهام: ادفع الآن، راجع الإثبات، اقبل أو ارفض.'], go: { href: '/inbox', label: ['Open Inbox', 'افتح الوارد'] } },
  { en: 'Listing', ar: 'موعد معروض', also: ['listings', 'slot', 'slots'], def: ['A product or programme on sale for a date.', 'منتج أو برنامج معروض للبيع في موعد.'], ex: ['Morning Markets, Fri 5 Dec, 06:45', 'Morning Markets، الجمعة 5 ديسمبر، 06:45'] },
  { en: 'Make an offer', ar: 'قدّم عرضًا', def: ['The button on quick sale products.', 'زر منتجات البيع السريع.'] },
  { en: 'Media type', ar: 'نوع الوسيلة', also: ['channel'], def: ['The kind of media a product is. A field on a product, not a page.', 'نوع الوسيلة الإعلانية للمنتج. حقل في المنتج وليس صفحة.'], ex: ['Radio, Newspaper, Podcast', 'إذاعة، صحيفة، بودكاست'] },
  { en: 'Minimum accepted', ar: 'الحد الأدنى المقبول', also: ['minimum', 'reserve', 'الحد الأدنى'], def: ['Seller only, private. The lowest amount a seller will accept. Buyers never see it.', 'للناشر فقط وخاص به: أقل مبلغ يقبله. لا يراه المشترون أبدًا.'] },
  { en: 'My bids', ar: 'عروضي', also: ['مزايداتي'], def: ['Side bar listing a buyer\'s open bids, on the Directory, outlet profile and Calendar.', 'شريط جانبي بعروض المشتري المفتوحة، في الدليل وصفحة المنفذ والتقويم.'] },
  { en: 'Not won', ar: 'لم يُختر', also: ['not selected', 'lost', 'لم يتم اختيارك'], def: ['Status: the seller declined, or another bid or offer was picked.', 'حالة: رفض الناشر، أو اختير عرض أو طلب آخر.'] },
  { en: 'Outbid', ar: 'تم تجاوز عرضك', also: ['out bid', 'تجاوز'], def: ['Status: someone bid higher on an auction.', 'حالة: قدّم أحدهم عرضًا أعلى في المزاد.'] },
  { en: 'Outlet', ar: 'منفذ', also: ['outlets', 'media brand', 'منافذ'], def: ['A media brand a seller owns.', 'علامة إعلامية يملكها الناشر.'], ex: ['Skyline FM, The National', 'Skyline FM، The National'] },
  { en: 'Outlet profile', ar: 'صفحة المنفذ', def: ['One outlet\'s page: About, Products, Calendar.', 'صفحة منفذ واحد: نبذة، المنتجات، التقويم.'] },
  { en: 'Paid', ar: 'مدفوع', def: ['Status: the buyer paid. Nashr holds the money until the ad runs and the proof is approved.', 'حالة: دفع المشتري. تحتفظ نشر بالمبلغ حتى يُعرض الإعلان ويُعتمد الإثبات.'] },
  { en: 'Paid out', ar: 'تم التحويل', def: ['Seller status: Nashr has paid the seller.', 'حالة للناشر: حوّلت نشر المبلغ إلى الناشر.'] },
  { en: 'Product', ar: 'منتج', also: ['products', 'منتجات'], def: ['What an outlet sells. Has one media type.', 'ما يبيعه المنفذ، وله نوع وسيلة واحد.'], ex: ['Skyline FM · Morning Markets', 'Skyline FM · Morning Markets'] },
  { en: 'Programme', ar: 'برنامج', also: ['program', 'show', 'برامج'], def: ['Optional show under a Radio, TV or Podcast product.', 'برنامج اختياري ضمن منتج إذاعي أو تلفزيوني أو بودكاست.'], ex: ['Morning Markets', 'Morning Markets'] },
  { en: 'Proof', ar: 'الإثبات', also: ['اثبات'], def: ['Evidence from the seller that the ad ran.', 'دليل من الناشر على أن الإعلان عُرض.'] },
  { en: 'Quick sale', ar: 'بيع سريع', def: ['A sale type. Buyers offer any amount (lower, higher or the same as the price); the seller picks the offer they like.', 'طريقة بيع. يعرض المشترون أي مبلغ (أقل أو أعلى أو مساوٍ للسعر)، ويختار الناشر العرض الذي يناسبه.'] },
  { en: 'Ran, check proof', ar: 'عُرض، راجع الإثبات', also: ['ran', 'check proof'], def: ['Status: the ad ran. The buyer checks the proof and approves it.', 'حالة: عُرض الإعلان. يراجع المشتري الإثبات ويعتمده.'] },
  { en: 'Reach', ar: 'الوصول', def: ['How many people a product reaches, given by the seller. Buyers can filter by it.', 'عدد من يصل إليهم المنتج كما يذكره الناشر، ويمكن للمشترين التصفية به.'], ex: ['120,000 listeners', '120,000 مستمع'] },
  { en: 'Remaining', ar: 'المتبقي', def: ['In a campaign: budget minus committed.', 'في الحملة: الميزانية ناقص الملتزم به.'] },
  { en: 'Request a quote', ar: 'اطلب عرض سعر', also: ['quote'], def: ['Shown on outlets not on Nashr yet, instead of prices.', 'يظهر للمنافذ غير الموجودة على نشر بعد، بدل الأسعار.'] },
  { en: 'Sale type', ar: 'طريقة البيع', also: ['sale types'], def: ['How a listing is sold: Auction, Fixed price or Quick sale.', 'كيف يُباع الموعد: مزاد أو سعر ثابت أو بيع سريع.'] },
  { en: 'Saved filters', ar: 'الفلاتر المحفوظة', also: ['saved search', 'saved searches'], def: ['A buyer\'s saved set of Directory filters.', 'مجموعة فلاتر الدليل التي حفظها المشتري.'] },
  { en: 'Saved outlets', ar: 'المنافذ المحفوظة', also: ['starred', 'favourites', 'المفضلة'], def: ['Outlets a buyer starred.', 'المنافذ التي ميّزها المشتري بنجمة.'] },
  { en: 'Sectors accepted', ar: 'القطاعات المقبولة', also: ['sectors', 'sector', 'القطاعات', 'قطاع'], def: ['Advertiser industries a product takes ads from. Buyers filter by it and can pick several.', 'قطاعات المعلنين التي يقبل المنتج إعلاناتها. يصفّي بها المشترون ويمكنهم اختيار أكثر من قطاع.'], ex: ['Banking, Real estate', 'المصارف، العقارات'] },
  { en: 'Sectors not accepted', ar: 'القطاعات غير المقبولة', also: ['blocked industries', 'blocked'], def: ['Industries a product won\'t take ads from.', 'القطاعات التي لا يقبل المنتج إعلاناتها.'] },
  { en: 'Seller', ar: 'ناشر', also: ['publisher', 'publishers', 'sellers', 'الناشر'], def: ['A media company that sells on Nashr. Owns one or more outlets.', 'شركة إعلامية تبيع على نشر، وتملك منفذًا أو أكثر.'], ex: ['Skyline Media Group', 'Skyline Media Group'] },
  { en: 'Starting price', ar: 'سعر البداية', def: ['The price a listing starts at. Filled in from the default price, editable when listing.', 'السعر الذي يبدأ به الموعد المعروض. يُملأ من السعر الافتراضي ويمكن تعديله عند العرض.'], ex: ['AED 3,500', '3,500 درهم'] },
  { en: 'VAT', ar: 'ضريبة القيمة المضافة', also: ['tax', 'الضريبة'], def: ['Prices on Nashr exclude VAT. VAT is added when the buyer pays.', 'الأسعار على نشر لا تشمل ضريبة القيمة المضافة، وتُضاف عند الدفع.'] },
  { en: 'Waiting for seller', ar: 'بانتظار الناشر', also: ['waiting'], def: ['Status: bidding has closed or a request was sent; the seller hasn\'t answered yet.', 'حالة: انتهت المزايدة أو أُرسل طلب، ولم يرد الناشر بعد.'] },
  { en: 'You lead', ar: 'أنت في المقدمة', also: ['leading'], def: ['Status: the buyer has the highest bid on an auction right now.', 'حالة: لدى المشتري أعلى عرض في المزاد حاليًا.'] },
  // pages and their parts
  { en: 'Outlets view', ar: 'عرض المنافذ', def: ['In the Directory: shows each media brand as a card. Click one to open its outlet profile.', 'في الدليل: يعرض كل علامة إعلامية كبطاقة. انقر عليها لفتح صفحة المنفذ.'] },
  { en: 'Products view', ar: 'عرض المنتجات', def: ['In the Directory: shows each product on sale, with its sale type, starting price, how many dates are on sale and the next date.', 'في الدليل: يعرض كل منتج معروض مع طريقة البيع وسعر البداية وعدد المواعيد المعروضة وأقرب موعد.'] },
  { en: 'More filters', ar: 'مزيد من عوامل التصفية', def: ['In the Directory: holds the extra filters: Sectors, Dates, Reach, Time of day and Saved filters.', 'في الدليل: يضم عوامل التصفية الإضافية: القطاعات والمواعيد والوصول ووقت البث والفلاتر المحفوظة.'] },
  { en: 'Time of day', ar: 'وقت البث', def: ['A Directory filter for Radio and TV only: when the ad airs.', 'عامل تصفية في الدليل للإذاعة والتلفزيون فقط: متى يُبث الإعلان.'] },
  { en: 'On Nashr only', ar: 'على نشر فقط', def: ['Hides outlets that aren\'t selling on Nashr yet (Request a quote).', 'يخفي المنافذ التي لا تبيع على نشر بعد (اطلب عرض سعر).'] },
  { en: 'Fits my budget', ar: 'ضمن ميزانيتي', def: ['With a campaign picked, hides anything priced above what\'s left in that campaign\'s budget.', 'عند اختيار حملة، يخفي كل ما سعره أعلى من المتبقي في ميزانيتها.'] },
  { en: 'Sort by', ar: 'الترتيب حسب', def: ['Orders results: Most popular, Price: low to high, Price: high to low, Closing soonest, Newest on Nashr.', 'يرتّب النتائج: الأكثر طلبًا، السعر من الأقل، السعر من الأعلى، الأقرب إغلاقًا، الأحدث على نشر.'] },
  { en: 'Most popular', ar: 'الأكثر طلبًا', def: ['Products with the most bookings and bids in the last 90 days first. Nobody sees the numbers.', 'المنتجات الأكثر حجوزات وعروضًا في آخر 90 يومًا أولًا، ولا يرى أحد الأرقام.'] },
  { en: 'Upcoming', ar: 'قادمة', def: ['A campaign that hasn\'t started yet (before its start date).', 'حملة لم تبدأ بعد (قبل تاريخ بدايتها).'] },
  { en: 'Active', ar: 'نشطة', def: ['A campaign that is running (between its dates).', 'حملة جارية (بين تاريخيها).'] },
  { en: 'Finished', ar: 'منتهية', def: ['A campaign that has ended (after its end date).', 'حملة انتهت (بعد تاريخ نهايتها).'] },
  { en: 'Bookings', ar: 'الحجوزات', def: ['In Reports: everything a seller accepted, from payment to proof.', 'في التقارير: كل ما قبله الناشر، من الدفع إلى الإثبات.'], roles: ['buyer', 'admin'] },
  { en: 'Results', ar: 'النتائج', def: ['In Reports, and a campaign tab: what bookings delivered: spend, airings, proof and the reach sellers report.', 'في التقارير وفي تبويب الحملة: ما حققته الحجوزات من إنفاق ومرات عرض وإثبات والوصول الذي يذكره الناشرون.'] },
  { en: 'Receipts and invoices', ar: 'الإيصالات والفواتير', also: ['receipts', 'invoices'], def: ['Orders, payment receipts, tax invoices and credit notes, as PDFs.', 'أوامر الشراء وإيصالات الدفع والفواتير الضريبية والإشعارات الدائنة، بصيغة PDF.'] },
  { en: 'Transactions', ar: 'المعاملات', roles: ['seller', 'admin'], def: ['In a seller\'s Reports: every sale.', 'في تقارير الناشر: كل عملية بيع.'] },
  { en: 'Balances', ar: 'الأرصدة', roles: ['seller', 'admin'], def: ['In a seller\'s Reports: what the seller will be paid.', 'في تقارير الناشر: ما سيُحوَّل للناشر.'] },
  { en: 'To do', ar: 'مهام', def: ['In the Inbox: things that need you, most urgent first.', 'في الوارد: ما يحتاج منك إجراءً، الأكثر إلحاحًا أولًا.'] },
  { en: 'Messages', ar: 'الرسائل', def: ['In the Inbox: conversations about bookings.', 'في الوارد: المحادثات حول الحجوزات.'] },
]

/** What Nashr is (the knowledge base's opening). */
export const ABOUT_NASHR: [string, string] = [
  'Nashr is a media buying marketplace for the UAE (KSA coming soon). Instead of emailing outlets for quotes and rate cards, buyers find media, bid or buy, pay and track everything in one place. Buyers are brands, agencies and PR teams; sellers are media companies selling ad space and airtime on radio, TV, newspapers, magazines, websites, newsletters, podcasts and social media. The buyer pays only after the seller accepts, and Nashr holds the money until the ad has run and the buyer approves the proof, then pays the seller.',
  'نشر سوق لشراء الإعلانات في الإمارات (والسعودية قريبًا). بدل مراسلة المنافذ لطلب الأسعار، يجد المشترون الوسائل الإعلانية ويقدّمون عروضهم أو يشترون ويدفعون ويتابعون كل شيء في مكان واحد. المشترون علامات تجارية ووكالات وفرق علاقات عامة، والناشرون شركات إعلامية تبيع المساحات والأوقات الإعلانية في الإذاعة والتلفزيون والصحف والمجلات والمواقع والنشرات البريدية والبودكاست ووسائل التواصل. يدفع المشتري فقط بعد قبول الناشر، وتحتفظ نشر بالمبلغ حتى يُعرض الإعلان ويعتمد المشتري الإثبات، ثم تحوّله للناشر.',
]

/** Who sees what (the knowledge base's privacy tables), told to the person asking from their side. */
export const WHO_SEES: Record<'buyer' | 'seller', [string, string]> = {
  buyer: [
    'Publishers see your brief (advertiser or brand, or your client\'s name and logo, industry, what the ad will say, creative language, disclaimer), your creative and your bid amount. They never see your budget, your campaign\'s estimated, committed or remaining amounts, its name, dates or objective, the other products in your campaign, who the other bidders are, or a client\'s billing email or address.',
    'يرى الناشرون ملخص إعلانك (المعلن أو العلامة التجارية، أو اسم عميلك وشعاره، والقطاع، وما سيقوله الإعلان، ولغة المادة، وإخلاء المسؤولية)، ومادتك الإعلانية، ومبلغ عرضك. ولا يرون أبدًا ميزانيتك، ولا المبالغ التقديرية أو الملتزم بها أو المتبقية في حملتك، ولا اسمها أو تواريخها أو هدفها، ولا بقية منتجات حملتك، ولا هوية المزايدين الآخرين، ولا البريد أو العنوان الخاص بفواتير عميلك.',
  ],
  seller: [
    'Buyers see your products, dates on sale, price and sale type, the top bid and the number of bids, the time left to bid, and what you wrote: description, audience, sectors, requirements and reach. They never see your minimum accepted, who the other bidders are, Nashr\'s fee or your payout, or your own notes.',
    'يرى المشترون منتجاتك ومواعيدك المعروضة وسعرها وطريقة بيعها، وأعلى عرض وعدد العروض، والوقت المتبقي للمزايدة، وما كتبته: الوصف والجمهور والقطاعات والمتطلبات والوصول. ولا يرون أبدًا الحد الأدنى الذي تقبله، ولا هوية المزايدين الآخرين، ولا رسوم نشر أو ما يُحوَّل لك، ولا ملاحظاتك الخاصة.',
  ],
}

export const pick = (x: [string, string]) => isAr ? x[1] : x[0]

/** Words that belong together, so Athena suggests the next useful question ("Auction" → "Quick sale", "Fixed price"). */
export const FAMILIES: string[][] = [
  ['Auction', 'Quick sale', 'Fixed price', 'Sale type', 'Buy now', 'Bid', 'Make an offer', 'Buy'],
  ['You lead', 'Outbid', 'Waiting for seller', 'Accepted, pay now', 'Paid', 'Ran, check proof', 'Completed', 'Not won', 'Closed', 'Paid out', 'Added'],
  ['Campaign', 'Estimated', 'Committed', 'Remaining', 'Fits my budget', 'Client'],
  ['Reach', 'Close match', 'Audience', 'Sectors accepted', 'Sectors not accepted', 'Media type'],
  ['Bidding closes', 'Creative due', 'Creative', 'Brief', 'Bid drawer', 'Edit for this bid', 'Proof'],
  ['Default price', 'Starting price', 'Minimum accepted', 'Listing', 'VAT'],
  ['Directory', 'Outlets view', 'Products view', 'More filters', 'Time of day', 'On Nashr only', 'Sort by', 'Most popular', 'Saved filters', 'Saved outlets', 'Check availability', 'Request a quote'],
  ['Outlet', 'Outlet profile', 'Product', 'Programme', 'Seller', 'Buyer'],
  ['Inbox', 'To do', 'Messages', 'My bids', 'Calendar'],
  ['Bookings', 'Results', 'Receipts and invoices', 'Transactions', 'Balances'],
  ['Upcoming', 'Active', 'Finished'],
]
