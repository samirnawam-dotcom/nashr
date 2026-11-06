import { AR_BUYER } from './i18n-ar-buyer'

/*
 * Arabic for every string marked with t(). Modern Standard Arabic in a plain business register, the way UAE media
 * buyers and publishers write; Latin digits. Keys are the English sentences; {name} placeholders must be kept.
 * A test (i18n.test.ts) fails if a string marked with t() has no Arabic here.
 */
export const AR: Record<string, string> = {
  // Navigation, roles, shell
  'Home': 'الرئيسية', 'Calendar': 'التقويم', 'Directory': 'الدليل', 'Sign in': 'تسجيل الدخول', 'Sign out': 'تسجيل الخروج', 'Request access': 'طلب الانضمام',
  'Dashboard': 'لوحة التحكم', 'Campaigns': 'الحملات', 'Bookings': 'الحجوزات', 'Athena': 'أثينا', 'Inbox': 'الوارد', 'Deals': 'الصفقات', 'Earnings': 'الأرباح',
  'Listings': 'العروض', 'Profile': 'الملف', 'Overview': 'نظرة عامة', 'Access': 'طلبات الانضمام', 'Accounts': 'الحسابات', 'Disputes': 'النزاعات', 'Funds': 'الأموال',
  'Payouts': 'المدفوعات', 'Reports': 'التقارير', 'Audit': 'سجل التدقيق', 'Settings': 'الإعدادات', 'Money': 'المال', 'System': 'النظام', 'Your business': 'أعمالك',
  'Plan and book': 'التخطيط والحجز', 'Buyer': 'مشترٍ', 'Publisher': 'ناشر', 'Nashr operations': 'عمليات نشر', 'Nashr founder': 'مؤسس نشر', 'Menu': 'القائمة', 'Main': 'الرئيسية',
  'Loading…': 'جارٍ التحميل…', 'Not found': 'الصفحة غير موجودة', 'Back to the start': 'العودة إلى البداية', 'Stop viewing': 'إيقاف العرض', 'soon': 'قريبًا', 'Nashr home': 'الصفحة الرئيسية لنشر',
  'Viewing {name} as Nashr, read only. Every page you open is logged.': 'تعرض حساب {name} بصفتك نشر، للقراءة فقط. تُسجَّل كل صفحة تفتحها.',
  'Sign in to {action}.': 'سجّل الدخول لـ{action}.', 'bid or book': 'المزايدة أو الحجز',
  'Nashr is invite-only for UAE brands, agencies and media outlets.': 'الانضمام إلى نشر بدعوة فقط للعلامات التجارية والوكالات والمنصات الإعلامية في الإمارات.',

  // Channels and sale types
  'Radio': 'إذاعة', 'TV': 'تلفزيون', 'Print': 'صحف ومطبوعات', 'Digital': 'رقمي', 'Podcast': 'بودكاست', 'Podcasts': 'بودكاست',
  'Auction': 'مزاد', 'Quick sale': 'بيع سريع', 'quick sale': 'بيع سريع',

  // Landing
  'Live in the UAE. Saudi Arabia next.': 'متاح الآن في الإمارات، والسعودية قريبًا.',
  'Book UAE airtime and pages in one place.': 'احجز إعلانك في الإذاعة والتلفزيون والصحف من مكان واحد.',
  'Bid on radio breaks, TV spots, print pages, homepage takeovers and podcast reads, directly from the publishers. Your payment is held until the publisher proves the ad ran.':
    'زايد على الفواصل الإذاعية والإعلانات التلفزيونية وصفحات الصحف والصفحات الرئيسية للمواقع وإعلانات البودكاست، مباشرةً من الناشرين. تبقى دفعتك محفوظة حتى يُثبت الناشر أن الإعلان قد بُث.',
  'Browse the calendar': 'تصفّح التقويم', "Every slot and price is open to browse. Sign in when you're ready to bid.": 'جميع المساحات والأسعار متاحة للتصفّح. سجّل الدخول عندما تكون مستعدًا للمزايدة.',
  'How it works': 'كيف يعمل', 'Example programme board. Open the live calendar': 'لوحة برامج توضيحية. افتح التقويم المباشر', 'Dubai time': 'بتوقيت دبي', 'Bidding live': 'المزايدة جارية',
  'Skyline FM, Break 2 at 07:15': 'Skyline FM، الفاصل 2 الساعة 07:15', 'Top bid, 3% steps': 'أعلى مزايدة، بزيادات 3%', 'You lead': 'أنت في المقدمة',
  'Closes in {n}h': 'يُغلق خلال {n} س', 'Closes in {n}m': 'يُغلق خلال {n} د', 'Bidding closed': 'أُغلقت المزايدة',
  'What you can book': 'ما يمكنك حجزه', 'Morning': 'الصباح', '4 breaks': '4 فواصل', 'Drive': 'وقت الذروة', 'News': 'الأخبار', 'booked': 'محجوز', 'Evening': 'المساء', '2 spots': 'إعلانان',
  'Full page, business section': 'صفحة كاملة، قسم الأعمال', 'all day, from AED 20,000': 'طوال اليوم، ابتداءً من 20,000 درهم', 'Weekly episode': 'الحلقة الأسبوعية', 'pre-roll and mid-roll': 'قبل الحلقة وفي منتصفها',
  'Single breaks, any break, packages': 'فواصل منفردة، أي فاصل، باقات', 'Spots by programme and time': 'إعلانات حسب البرنامج والوقت', 'Pages by edition and section': 'صفحات حسب العدد والقسم',
  'Homepage takeovers by day': 'الاستحواذ على الصفحة الرئيسية باليوم', 'Pre-roll, mid-roll, post-roll': 'قبل الحلقة، في منتصفها، بعدها',
  'Your media plan, money and proof on one desk.': 'خطتك الإعلامية وأموالك وإثباتات البث في مكان واحد.',
  "See what you've committed, what's held and what needs you today. Publishers see their sales, buyers and payouts the same way.": 'اطّلع على ما التزمت به وما هو محفوظ وما يحتاج إلى إجراء منك اليوم. ويرى الناشرون مبيعاتهم ومشتريهم ومدفوعاتهم بالطريقة نفسها.',
  'The buyer dashboard: money held, weekly spend, payments due and live bids': 'لوحة تحكم المشتري: الأموال المحفوظة والإنفاق الأسبوعي والمدفوعات المستحقة والمزايدات الجارية',
  'Every slot, in Dubai time': 'كل المساحات بتوقيت دبي', "Radio breaks, TV spots, pages and takeovers by day, week or month, with the price and what's left.": 'الفواصل الإذاعية والإعلانات التلفزيونية والصفحات والاستحواذات باليوم أو الأسبوع أو الشهر، مع السعر والمتبقي.',
  'Prices you can read': 'أسعار واضحة', "Every price says where it comes from, so you know what's typical before you bid.": 'كل سعر يوضّح مصدره، لتعرف السعر المعتاد قبل أن تزايد.', 'Price labels': 'تصنيفات الأسعار',
  'AED 15,000–18,000': '15,000–18,000 درهم', 'AED 9,000': '9,000 درهم', 'AED 18,000–26,000': '18,000–26,000 درهم',
  'Typical on Nashr': 'المعتاد على نشر', "Publisher's rate": 'سعر الناشر', 'Estimate, unconfirmed': 'تقدير غير مؤكد',
  'Paid only after proof': 'لا دفع إلا بعد الإثبات', 'The publisher is paid when you approve the as-run log, tearsheet or screenshots.': 'يُدفع للناشر عندما توافق على سجل البث أو نسخة الصفحة المنشورة أو لقطات الشاشة.',
  'Held': 'محفوظ', 'Brief, creative and proof in one place': 'الموجز والمادة الإعلانية والإثبات في مكان واحد',
  'No email chains. Every booking keeps its own record, from the first bid to the tax invoice.': 'لا مزيد من سلاسل البريد الإلكتروني. لكل حجز سجله الخاص، من أول مزايدة حتى الفاتورة الضريبية.',
  'Example booking record': 'مثال على سجل حجز', 'Brief sent with the bid': 'أُرسل الموجز مع المزايدة', 'Creative approved': 'اعتُمدت المادة الإعلانية', 'Proof received': 'استُلم الإثبات', 'Approve and release': 'وافق وحرّر الدفعة',
  'From bid to broadcast, with the money held in between.': 'من المزايدة إلى البث، والمال محفوظ طوال الطريق.',
  'Every booking follows the same five steps, with a clock on each one so nobody is left waiting.': 'يمر كل حجز بالخطوات الخمس نفسها، ولكل خطوة مهلة زمنية حتى لا ينتظر أحد.',
  'Bid or request': 'زايد أو اطلب', 'Bid in 3% steps, set an auto-bid limit, or ask for the buy-now price. Nothing is charged.': 'زايد بزيادات 3%، أو حدّد سقفًا للمزايدة التلقائية، أو اطلب سعر الشراء الفوري. لا يُخصم أي مبلغ.',
  'Publisher accepts': 'الناشر يوافق', 'The publisher sees your brief and decides within 24 hours.': 'يطّلع الناشر على موجزك ويقرر خلال 24 ساعة.',
  'Pay, money held': 'ادفع، والمال محفوظ', 'Pay within 48 hours. The money waits with Nashr, not the publisher.': 'ادفع خلال 48 ساعة. يبقى المال لدى نشر، لا لدى الناشر.',
  'Ad runs, proof sent': 'يُبث الإعلان ويُرسل الإثبات', 'The publisher sends proof: the as-run log, the tearsheet, the screenshots.': 'يرسل الناشر الإثبات: سجل البث أو نسخة الصفحة المنشورة أو لقطات الشاشة.',
  'Approve, money released': 'وافق، ويُحرَّر المال', 'Approve and the publisher is paid, or it releases itself after 5 working days.': 'وافق ليُدفع للناشر، أو يُحرَّر المبلغ تلقائيًا بعد 5 أيام عمل.',
  'A planning team mapping a campaign on a glass wall': 'فريق تخطيط يرسم حملة على جدار زجاجي', 'For brands and agencies': 'للعلامات التجارية والوكالات', 'Every UAE outlet on one calendar.': 'كل المنصات الإعلامية في الإمارات على تقويم واحد.',
  'Browse slots by day, week or month, in Dubai time, with prices excluding VAT.': 'تصفّح المساحات باليوم أو الأسبوع أو الشهر بتوقيت دبي، والأسعار لا تشمل ضريبة القيمة المضافة.',
  'Plan campaigns against a budget, with committed and remaining spend.': 'خطّط حملاتك وفق ميزانية، مع الإنفاق الملتزم به والمتبقي.',
  "Upload creative, approve proof and download the publisher's tax invoice in one place.": 'ارفع المادة الإعلانية ووافق على الإثبات ونزّل الفاتورة الضريبية للناشر من مكان واحد.',
  'Broadcast camera operators filming a live programme': 'مصورو بث يصوّرون برنامجًا مباشرًا', 'For radio, TV, print, digital and podcasts': 'للإذاعة والتلفزيون والصحف والمنصات الرقمية والبودكاست',
  'Sell your inventory to serious buyers.': 'بِع مساحاتك الإعلانية لمشترين جادّين.',
  'List programmes with their breaks, set a reserve, a buy-now price and a package price.': 'اعرض البرامج بفواصلها، وحدّد سعرًا أدنى وسعر شراء فوري وسعر باقة.',
  'Decide with the full picture: the buyer, the brief and exactly what you receive.': 'قرّر وأنت ترى الصورة كاملة: المشتري والموجز وما ستستلمه بالضبط.',
  'Tax invoices in your name and TRN, and a monthly payout statement.': 'فواتير ضريبية باسمك ورقمك الضريبي، وكشف مدفوعات شهري.', 'List your outlet': 'أضف منصتك',
  'Nobody is paid until the ad has run.': 'لا يُدفع لأحد حتى يُبث الإعلان.',
  "The buyer pays Nashr, Nashr holds it, and the publisher is paid when the proof is approved. If the ad doesn't run, the buyer is refunded. VAT and fees are shown before anyone commits.":
    'يدفع المشتري لنشر، وتحتفظ نشر بالمبلغ، ويُدفع للناشر عند اعتماد الإثبات. وإذا لم يُبث الإعلان يُسترد المبلغ للمشتري. وتُعرض الضريبة والرسوم قبل أي التزام.',
  'Example booking: AED 5,500 radio break': 'مثال على حجز: فاصل إذاعي بـ5,500 درهم', 'Example: one radio break': 'مثال: فاصل إذاعي واحد', 'Held until proof': 'محفوظ حتى الإثبات',
  'Break price': 'سعر الفاصل', 'AED 5,500': '5,500 درهم', 'VAT, charged by the publisher (5%)': 'ضريبة القيمة المضافة يفرضها الناشر (5%)', 'AED 275': '275 درهم',
  'Buyer pays': 'يدفع المشتري', 'AED 5,775': '5,775 درهم', 'Nashr commission (example, 12%)': 'عمولة نشر (مثال، 12%)', '−AED 660': '−660 درهم',
  'Publisher receives on approval': 'يستلم الناشر عند الموافقة', 'AED 5,115': '5,115 درهم', 'Example figures. The commission rate is agreed with each publisher.': 'أرقام توضيحية. يُتفق على نسبة العمولة مع كل ناشر.',
  'Questions buyers and publishers ask': 'أسئلة يطرحها المشترون والناشرون', 'Ready when your next campaign is.': 'جاهزون لحملتك القادمة.',
  'Nashr is invite-only for UAE brands, agencies and media outlets. Our team reviews every request and sends an invite to your work email.':
    'الانضمام إلى نشر بدعوة فقط للعلامات التجارية والوكالات والمنصات الإعلامية في الإمارات. يراجع فريقنا كل طلب ويرسل دعوة إلى بريدك الإلكتروني للعمل.',
  'The UAE media marketplace. Prices in AED, times in Dubai time.': 'سوق الإعلام في الإمارات. الأسعار بالدرهم والأوقات بتوقيت دبي.',
  'Product': 'المنتج', 'Account': 'الحساب', 'Legal': 'الشؤون القانونية', 'Terms': 'الشروط', 'Privacy': 'الخصوصية', 'Refunds': 'الاسترداد', 'Made for the UAE media market': 'صُمّم لسوق الإعلام في الإمارات',

  // FAQ
  'What is Nashr?': 'ما هي نشر؟',
  'Nashr is an online marketplace where UAE brands and agencies book advertising directly from radio stations, TV channels, newspapers, websites and podcasts.':
    'نشر سوق إلكتروني تحجز فيه العلامات التجارية والوكالات في الإمارات إعلاناتها مباشرةً من محطات الإذاعة وقنوات التلفزيون والصحف والمواقع الإلكترونية والبودكاست.',
  'How do I buy advertising on Nashr?': 'كيف أشتري إعلانًا على نشر؟',
  'Find a slot on the calendar or in the directory, place a bid or request the buy-now price, and send your brief. Nothing is charged until the publisher accepts; then you pay within 48 hours.':
    'ابحث عن مساحة في التقويم أو الدليل، وقدّم مزايدة أو اطلب سعر الشراء الفوري، وأرسل موجزك. لا يُخصم أي مبلغ حتى يوافق الناشر، ثم تدفع خلال 48 ساعة.',
  'Is my payment safe?': 'هل دفعتي آمنة؟',
  'Your payment is held by Nashr, not the publisher. The publisher is paid only after you approve proof that the ad ran, or automatically after five working days.':
    'تحتفظ نشر بدفعتك، لا الناشر. ولا يُدفع للناشر إلا بعد موافقتك على إثبات بث الإعلان، أو تلقائيًا بعد خمسة أيام عمل.',
  'Are prices shown with VAT?': 'هل الأسعار المعروضة تشمل ضريبة القيمة المضافة؟',
  'Prices are shown excluding VAT. Where the publisher is VAT-registered, 5% VAT is added at payment and shown before you pay.':
    'تُعرض الأسعار دون ضريبة القيمة المضافة. وإذا كان الناشر مسجّلًا في الضريبة تُضاف ضريبة 5% عند الدفع وتظهر لك قبل أن تدفع.',
  'Can I cancel a booking?': 'هل يمكنني إلغاء حجز؟',
  'Yes. Cancelling within 24 hours of paying is free apart from the card processing cost; after that a 15% cancellation fee applies, and there is no refund after the creative deadline.':
    'نعم. الإلغاء خلال 24 ساعة من الدفع مجاني باستثناء رسوم معالجة البطاقة، وبعد ذلك تُطبّق رسوم إلغاء بنسبة 15%، ولا يُسترد أي مبلغ بعد الموعد النهائي لتسليم المادة الإعلانية.',
  'How do publishers sell on Nashr?': 'كيف يبيع الناشرون على نشر؟',
  'Publishers list programmes, breaks, pages or placements with a starting price, reserve and buy-now price, accept the bookings they want, and are paid after the buyer approves proof.':
    'يعرض الناشرون البرامج أو الفواصل أو الصفحات أو المساحات بسعر بداية وسعر أدنى وسعر شراء فوري، ويقبلون الحجوزات التي يريدونها، ويُدفع لهم بعد موافقة المشتري على الإثبات.',

  // Sign in and sign up
  'About Nashr': 'عن نشر', 'Channels': 'القنوات',
  'Bid on radio breaks, TV spots, print pages, homepages and podcasts. Your money is held until the publisher proves the ad ran.': 'زايد على الفواصل الإذاعية والإعلانات التلفزيونية وصفحات الصحف والمواقع والبودكاست. يبقى مالك محفوظًا حتى يُثبت الناشر أن الإعلان قد بُث.',
  'Welcome back. Bid, book and follow every payment in one place.': 'أهلًا بعودتك. زايد واحجز وتابع كل دفعة من مكان واحد.', 'Work email': 'البريد الإلكتروني للعمل', 'Password': 'كلمة المرور',
  'Code from your authenticator app': 'الرمز من تطبيق المصادقة', '6 digits': '6 أرقام', 'Hide': 'إخفاء', 'Show': 'إظهار', 'Signing in…': 'جارٍ تسجيل الدخول…', 'New to Nashr?': 'جديد على نشر؟',
  'Request sent': 'أُرسل الطلب', "Thanks. Nashr's team reviews every request and will email you an invite link once approved.": 'شكرًا لك. يراجع فريق نشر كل طلب وسيرسل إليك رابط الدعوة بالبريد الإلكتروني عند الموافقة.',
  'Nashr is invite-only for UAE brands, agencies and media outlets. Tell us who you are and we will be in touch.': 'الانضمام إلى نشر بدعوة فقط للعلامات التجارية والوكالات والمنصات الإعلامية في الإمارات. عرّفنا بنفسك وسنتواصل معك.',
  'Full name': 'الاسم الكامل', 'Phone': 'الهاتف', 'Company': 'الشركة', 'Your role': 'منصبك', 'You are': 'أنت', 'A brand': 'علامة تجارية', 'An agency': 'وكالة', 'A media outlet': 'منصة إعلامية',
  'Sending…': 'جارٍ الإرسال…', 'Send request': 'إرسال الطلب', "By sending, you agree to Nashr's": 'بالإرسال، فإنك توافق على', 'terms of use': 'شروط الاستخدام', 'and': 'و', 'privacy policy': 'سياسة الخصوصية لدى نشر',
  'Already invited?': 'لديك دعوة؟', 'You are in': 'تم التفعيل', 'Set your password': 'عيّن كلمة المرور',
  'Your account is ready. Sign in with your work email and new password.': 'حسابك جاهز. سجّل الدخول ببريدك الإلكتروني للعمل وكلمة المرور الجديدة.',
  'Choose a password for your Nashr account. Use at least 12 characters.': 'اختر كلمة مرور لحسابك في نشر، من 12 حرفًا على الأقل.', 'Repeat password': 'أعد كتابة كلمة المرور',
  'Staff accounts need an authenticator app. Add this key to your app, then enter the 6-digit code.': 'تتطلب حسابات الموظفين تطبيق مصادقة. أضف هذا المفتاح إلى التطبيق، ثم أدخل الرمز المكوّن من 6 أرقام.',
  'Activate': 'تفعيل', 'Continue': 'متابعة',

  // Directory and outlet pages
  'UAE radio, TV, print, digital and podcasts. Outlets on Nashr can be booked; others take a quote request.': 'الإذاعة والتلفزيون والصحف والمنصات الرقمية والبودكاست في الإمارات. يمكن حجز المنصات المسجّلة على نشر، وللمنصات الأخرى يمكنك طلب عرض سعر.',
  'Price on request': 'السعر عند الطلب', 'Book slots': 'احجز المساحات', 'Coming soon': 'قريبًا', 'Not on Nashr yet · request a quote': 'غير مسجّلة على نشر بعد · اطلب عرض سعر',
  'On Nashr · book slots': 'على نشر · احجز المساحات', 'Request quote': 'طلب عرض سعر', 'All': 'الكل', 'Channel': 'القناة', 'Grid': 'شبكة', 'List': 'قائمة',
  'No outlets match. Clear the filters to see everything.': 'لا توجد منصات مطابقة. امسح عوامل التصفية لرؤية كل شيء.', 'Outlet': 'المنصة', 'Price': 'السعر', 'Sectors': 'القطاعات',
  'UAE': 'الإمارات', 'KSA · coming soon': 'السعودية · قريبًا', 'Market': 'السوق', 'Search': 'بحث', 'View': 'طريقة العرض', 'Search outlets, sectors, audiences': 'ابحث عن المنصات والقطاعات والجماهير',
  'On Nashr only': 'المسجّلة على نشر فقط', 'Saudi Arabia opens soon. You can add Saudi outlets to a campaign plan now; booking opens with the market.': 'يُفتتح سوق السعودية قريبًا. يمكنك إضافة المنصات السعودية إلى خطة حملتك الآن، ويُفتح الحجز مع افتتاح السوق.',
  'Tell me when KSA opens': 'أبلغني عند افتتاح السعودية', "You're on the list. We'll tell you when it opens.": 'تمت إضافتك إلى القائمة. سنبلغك عند الافتتاح.',
  'Add to campaign': 'أضف إلى حملة', 'Add to campaign…': 'أضف إلى حملة…', 'Added to {name}.': 'أُضيفت إلى {name}.',
  'Coming soon: this market is not open yet. You can plan it in a campaign; booking opens with the market.': 'قريبًا: هذا السوق غير مفتوح بعد. يمكنك إضافته إلى خطة حملة، ويُفتح الحجز مع افتتاح السوق.',
  'On Nashr': 'على نشر', '{n} completed bookings': '{n} حجزًا مكتملًا', 'New on Nashr': 'جديد على نشر', 'Website': 'الموقع الإلكتروني',
  "This range is Nashr's estimate. The outlet has not confirmed it.": 'هذا النطاق تقدير من نشر، ولم تؤكده المنصة.', 'Request a quote': 'اطلب عرض سعر',
  "This outlet isn't on Nashr yet. Tell us what you need and Nashr's team will get you a price.": 'هذه المنصة غير مسجّلة على نشر بعد. أخبرنا بما تحتاجه وسيحصل لك فريق نشر على السعر.',
  "What you'd like to book": 'ما الذي تريد حجزه', 'Dates, formats, budget': 'التواريخ والصيغ والميزانية', 'Emails and phone numbers are not allowed.': 'لا يُسمح بعناوين البريد الإلكتروني وأرقام الهواتف.',
  'Sent. Nashr will come back to you with a quote.': 'تم الإرسال. ستعود إليك نشر بعرض سعر.', 'What buyers say': 'آراء المشترين', 'Verified booking': 'حجز موثّق',
  'Placement': 'المساحة', 'When': 'الموعد', 'Sold as': 'طريقة البيع', 'From': 'ابتداءً من', 'Options': 'الخيارات', 'Next open': 'التالي المتاح',
  '{n} positions': '{n} مواضع', '{n} breaks': '{n} فواصل', 'buy now {price}': 'شراء فوري بـ{price}', 'Any break {price}': 'أي فاصل بـ{price}', 'All breaks {price}': 'جميع الفواصل بـ{price}',
  '{n} open': '{n} متاح', 'Nothing open': 'لا شيء متاح',
  'Mon': 'الإثنين', 'Tue': 'الثلاثاء', 'Wed': 'الأربعاء', 'Thu': 'الخميس', 'Fri': 'الجمعة', 'Sat': 'السبت', 'Sun': 'الأحد',

  // Calendar
  'Not available': 'غير متاح', 'Outbid': 'تجاوزك آخرون', 'Open to offers': 'مفتوح للعروض', 'Starting price': 'سعر البداية', '{n} interested': '{n} مهتمّون', '{n} bids': '{n} مزايدات',
  'Nothing open for these days. Bidding closes a few days before air.': 'لا شيء متاح في هذه الأيام. تُغلق المزايدة قبل البث ببضعة أيام.', 'Show the next week': 'اعرض الأسبوع التالي',
  'All day': 'طوال اليوم', ', {n} options': '، {n} خيارات', 'from {price}': 'ابتداءً من {price}', 'Filters': 'عوامل التصفية',
  'Sign in to save this search and get an alert when new slots match.': 'سجّل الدخول لحفظ هذا البحث وتلقّي تنبيه عند توفّر مساحات جديدة مطابقة.',
  'Outlet, programme or audience': 'المنصة أو البرنامج أو الجمهور', 'Sale type': 'طريقة البيع', 'Sector': 'القطاع', 'Any sector': 'أي قطاع', 'Up to (AED, excl. VAT)': 'حتى (بالدرهم، دون الضريبة)',
  'Any price': 'أي سعر', 'Time of day': 'وقت اليوم', 'Bidding closes within 24 hours': 'تُغلق المزايدة خلال 24 ساعة', 'Clear filters': 'مسح عوامل التصفية', 'Key': 'دليل الرموز', 'Closes soon': 'يُغلق قريبًا',
  'All times are Dubai time. Prices exclude VAT.': 'جميع الأوقات بتوقيت دبي. الأسعار لا تشمل ضريبة القيمة المضافة.',
  'Every open radio break, TV spot, page and takeover, in Dubai time. Prices exclude VAT.': 'كل الفواصل الإذاعية والإعلانات التلفزيونية والصفحات والاستحواذات المتاحة بتوقيت دبي. الأسعار لا تشمل ضريبة القيمة المضافة.',
  '{n} of {total} slots': '{n} من {total} مساحة', 'Today': 'اليوم', 'Previous': 'السابق', 'Next': 'التالي', 'Day': 'يوم', 'Week': 'أسبوع', 'Month': 'شهر',
  'Week of {from} – {to}': 'أسبوع {from} – {to}',
  'No slots match these filters this week.': 'لا توجد مساحات مطابقة لعوامل التصفية هذا الأسبوع.', 'No slots match these filters this day.': 'لا توجد مساحات مطابقة لعوامل التصفية في هذا اليوم.',
  'No slots match these filters this month.': 'لا توجد مساحات مطابقة لعوامل التصفية هذا الشهر.',
  'Your payment is held until the publisher proves the ad ran. You pay only once the publisher accepts.': 'تبقى دفعتك محفوظة حتى يُثبت الناشر أن الإعلان قد بُث. ولا تدفع إلا بعد موافقة الناشر.',
  '{n} breaks · from ': '{n} فواصل · ابتداءً من ', 'You lead on {n}': 'أنت في المقدمة في {n}', '+{n} more': '+{n} أخرى',
  'Nothing on sale this day. Try the next day or the week view.': 'لا شيء معروض للبيع في هذا اليوم. جرّب اليوم التالي أو عرض الأسبوع.', 'Close': 'إغلاق',
  'Morning (5–12)': 'الصباح (5–12)', 'Afternoon (12–17)': 'الظهيرة (12–17)', 'Evening (17–24)': 'المساء (17–24)', 'All day (pages, takeovers)': 'طوال اليوم (صفحات، استحواذات)',
}
Object.assign(AR, AR_BUYER)
