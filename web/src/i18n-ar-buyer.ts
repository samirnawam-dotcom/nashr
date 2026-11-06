/* Arabic for the buyer pages (stage 2): dashboard, bookings, a booking, campaigns, media plan, receipts, bid window, saved searches, notifications. */
export const AR_BUYER: Record<string, string> = {
  // Notifications
  'The publisher accepted. Pay to secure the slot.': 'وافق الناشر. ادفع لتأمين المساحة.', 'Your request was not selected.': 'لم يُختر طلبك.',
  'The payment window passed and the booking lapsed.': 'انتهت مهلة الدفع وسقط الحجز.', 'Payment is secured.': 'تم تأمين الدفعة.', 'The booking was cancelled.': 'أُلغي الحجز.',
  'A refund was issued.': 'صدر استرداد للمبلغ.', 'Payment was released.': 'حُرّرت الدفعة.', 'New buy-now request.': 'طلب شراء فوري جديد.', 'New booking to decide on.': 'حجز جديد بانتظار قرارك.',
  'You were outbid on {slot}.': 'تجاوزك مزايد آخر على {slot}.', 'a slot': 'مساحة', 'New creative to review.': 'مادة إعلانية جديدة للمراجعة.', 'Your creative was approved.': 'اعتُمدت مادتك الإعلانية.',
  'The publisher asked for changes: {reason}': 'طلب الناشر تعديلات: {reason}', 'The publisher asked for changes.': 'طلب الناشر تعديلات.',
  'Your file has a technical problem. Upload a fixed version.': 'في ملفك مشكلة فنية. ارفع نسخة مصحّحة.', 'Your creative was rejected.': 'رُفضت مادتك الإعلانية.',
  'Proof is ready for your review.': 'الإثبات جاهز لمراجعتك.', 'Reminder: a booking request is waiting for your decision.': 'تذكير: طلب حجز بانتظار قرارك.',
  'Reminder: pay to secure your booking before the deadline.': 'تذكير: ادفع لتأمين حجزك قبل انتهاء المهلة.',
  'Reminder: review the proof. The money is released automatically at the deadline.': 'تذكير: راجع الإثبات. يُحرَّر المبلغ تلقائيًا عند انتهاء المهلة.',
  'Reminder: respond to the reported issue, or it goes to Nashr to decide.': 'تذكير: ردّ على المشكلة المُبلغ عنها، وإلا أُحيلت إلى نشر لتقرر.',
  'The buyer reported an issue.': 'أبلغ المشتري عن مشكلة.', 'The publisher offered a fix for your issue.': 'عرض الناشر حلًا لمشكلتك.', 'The issue was resolved.': 'حُلّت المشكلة.',
  'A dispute was opened.': 'فُتح نزاع.', 'Nashr decided the dispute: the payment is released to the publisher.': 'قررت نشر في النزاع: تُحرَّر الدفعة للناشر.',
  'Nashr decided the dispute: full refund to the buyer.': 'قررت نشر في النزاع: استرداد كامل للمشتري.', 'Nashr decided the dispute: a partial refund to the buyer.': 'قررت نشر في النزاع: استرداد جزئي للمشتري.',
  'Nashr decided the dispute: the ad runs again.': 'قررت نشر في النزاع: يُعاد بث الإعلان.', 'Nashr decided the dispute.': 'قررت نشر في النزاع.',
  'Confirm the final version before air.': 'أكّد النسخة النهائية قبل البث.', 'Confirm the slot and creative before air.': 'أكّد المساحة والمادة الإعلانية قبل البث.',
  '{company} requested access.': 'طلبت {company} الانضمام.', 'Someone': 'شخص ما', 'Quote requested for {outlet}.': 'طُلب عرض سعر لـ{outlet}.', 'an outlet': 'منصة',
  '1 new slot matches your search “{name}”.': 'مساحة جديدة واحدة تطابق بحثك “{name}”.', '{n} new slots match your search “{name}”.': '{n} مساحات جديدة تطابق بحثك “{name}”.',
  'Notifications, {n} unread': 'الإشعارات، {n} غير مقروءة', 'Notifications': 'الإشعارات', 'Nothing yet.': 'لا شيء بعد.',

  // Ratings
  'Rated {score} out of 5 from {n} bookings': 'التقييم {score} من 5 من {n} حجوزات', 'Rated {score} out of 5': 'التقييم {score} من 5',
  'Poor': 'ضعيف', 'Below expectations': 'دون التوقعات', 'Good': 'جيد', 'Very good': 'جيد جدًا', 'Excellent': 'ممتاز', '{n} of 5 stars': '{n} من 5 نجوم',
  'Your rating of {outlet}': 'تقييمك لـ{outlet}', 'Nashr has hidden this rating from the outlet page.': 'أخفت نشر هذا التقييم من صفحة المنصة.', 'Change rating': 'تغيير التقييم',
  'How was {outlet}?': 'كيف كانت تجربتك مع {outlet}؟', "Your rating helps other buyers choose. It shows on the outlet page as a verified booking, without your company's name.":
    'يساعد تقييمك المشترين الآخرين على الاختيار. يظهر في صفحة المنصة كحجز موثّق، دون اسم شركتك.',
  'Your rating': 'تقييمك', 'Comment (optional)': 'تعليق (اختياري)', 'Did it air as booked? How was working with them?': 'هل بُث الإعلان كما حُجز؟ كيف كان التعامل معهم؟',
  'Save rating': 'حفظ التقييم', 'Submit rating': 'إرسال التقييم', 'Cancel': 'إلغاء',

  // Bookings list and statuses
  'Every booking from bid to proof, with your payment held until you approve that the ad ran.': 'كل حجوزاتك من المزايدة حتى الإثبات، ودفعتك محفوظة حتى توافق على أن الإعلان قد بُث.',
  'Receipts and invoices': 'الإيصالات والفواتير', 'No bookings yet. Bid on a slot in the calendar, or send a buy-now request.': 'لا حجوزات بعد. زايد على مساحة في التقويم، أو أرسل طلب شراء فوري.',
  'Order': 'الطلب', 'Slot': 'المساحة', 'Airs': 'موعد البث', 'Total': 'الإجمالي', 'Status': 'الحالة',
  'Awaiting publisher': 'بانتظار الناشر', 'Accepted, pay now': 'مقبول، ادفع الآن', 'Payment secured': 'الدفعة مؤمّنة', 'Proof ready, review': 'الإثبات جاهز، راجعه',
  'Issue reported': 'أُبلغ عن مشكلة', 'Disputed': 'محل نزاع', 'Released': 'محرّرة', 'Complete': 'مكتمل', 'Not selected': 'لم يُختر', 'Lapsed': 'ساقط', 'Cancelled': 'ملغى', 'Refunded': 'مسترد',

  // Booking page
  'Visa •••• 4242': 'Visa •••• 4242', 'Visa •••• 3155 (bank asks to confirm)': 'Visa •••• 3155 (يطلب البنك التأكيد)', 'Visa •••• 0002 (declined)': 'Visa •••• 0002 (مرفوضة)',
  'Request sent': 'أُرسل الطلب', 'Publisher accepted': 'وافق الناشر', 'Publisher did not reply in time': 'لم يردّ الناشر في الوقت المحدد', 'Slot went to another buyer': 'ذهبت المساحة إلى مشترٍ آخر',
  'Payment window passed': 'انتهت مهلة الدفع', 'Proof sent': 'أُرسل الإثبات', 'You approved the proof': 'وافقت على الإثبات', 'Released automatically after the review window': 'حُرّرت تلقائيًا بعد انتهاء مهلة المراجعة',
  'You reported an issue': 'أبلغت عن مشكلة', 'Corrected proof sent': 'أُرسل الإثبات المصحّح', 'Make-good agreed': 'اتُفق على إعادة البث', 'Partial refund agreed': 'اتُفق على استرداد جزئي',
  'Escalated to Nashr': 'أُحيلت إلى نشر', 'Nashr released the payment': 'حرّرت نشر الدفعة', 'Publisher paid': 'دُفع للناشر', 'You cancelled': 'ألغيت الحجز', 'Publisher cancelled': 'ألغى الناشر الحجز',
  'Creative deadline missed': 'فات الموعد النهائي للمادة الإعلانية', 'Proof not sent in time, refunded': 'لم يُرسل الإثبات في الوقت المحدد، واستُرد المبلغ',
  'With the publisher': 'لدى الناشر', 'Approved': 'معتمدة', 'Changes requested': 'طُلبت تعديلات', 'Technical problem': 'مشكلة فنية', 'Rejected': 'مرفوضة',
  'The ad did not run': 'لم يُبث الإعلان', 'Wrong time or date': 'وقت أو تاريخ خاطئ', 'Wrong position or page': 'موضع أو صفحة خاطئة', 'The creative was altered': 'عُدّلت المادة الإعلانية',
  'Poor quality': 'جودة رديئة', 'Something else': 'سبب آخر', 'Download': 'تنزيل', 'Booking progress': 'تقدّم الحجز',
  'Requested': 'طُلب', 'Accepted': 'قُبل', 'Paid': 'مدفوع', 'Aired': 'بُث',
  'Version {n} sent to the publisher.': 'أُرسلت النسخة {n} إلى الناشر.', 'Update your card and try again.': 'حدّث بطاقتك وحاول مجددًا.', 'Your bank needs you to confirm this payment.': 'يطلب بنكك تأكيد هذه الدفعة.',
  'Order {ref}': 'الطلب {ref}', 'Pre-run check': 'تحقق قبل البث', 'Your ad airs soon. Confirm the publisher has the final version of your creative.': 'سيُبث إعلانك قريبًا. أكّد أن الناشر لديه النسخة النهائية من مادتك الإعلانية.',
  'Thanks. The publisher has been told.': 'شكرًا. أُبلغ الناشر.', 'Confirm final version': 'تأكيد النسخة النهائية', 'Proof the ad ran': 'إثبات بث الإعلان',
  'As-run log': 'سجل البث', 'Audio clip': 'المقطع الصوتي', 'Video clip': 'مقطع الفيديو', 'Tearsheet': 'نسخة الصفحة المنشورة', 'Dated screenshots': 'لقطات شاشة مؤرّخة', 'Start time': 'وقت البدء',
  'End time': 'وقت الانتهاء', 'Episode link': 'رابط الحلقة', 'Live link': 'الرابط المباشر', 'Time of the ad in the episode': 'توقيت الإعلان في الحلقة',
  'Approve to release the payment to the publisher. If you do nothing, it is released automatically on {date}.': 'وافق لتحرير الدفعة للناشر. إذا لم تتخذ أي إجراء، تُحرَّر تلقائيًا في {date}.',
  'Approve to release the payment to the publisher.': 'وافق لتحرير الدفعة للناشر.', 'Approve proof': 'الموافقة على الإثبات', 'Report an issue': 'الإبلاغ عن مشكلة', 'What went wrong': 'ما المشكلة',
  'Choose…': 'اختر…', 'Details': 'التفاصيل',
  'The publisher can send corrected proof, offer a make-good or a partial refund. Changing your mind or results below expectations are not issues.':
    'يمكن للناشر إرسال إثبات مصحّح أو عرض إعادة البث أو استرداد جزئي. تغيير رأيك أو نتائج دون التوقعات لا تُعد مشكلة.',
  'Issue reported. The publisher has 48 hours to respond.': 'أُبلغ عن المشكلة. لدى الناشر 48 ساعة للرد.', 'Report issue': 'إرسال البلاغ', 'Back': 'رجوع', 'Issue: {reason}': 'المشكلة: {reason}',
  "Nashr's team is looking at this and will decide the outcome.": 'يدرس فريق نشر الأمر وسيقرر النتيجة.', 'The publisher offers:': 'يعرض الناشر:',
  'a make-good on {date}': 'إعادة البث في {date}', 'a partial refund of {amount}': 'استردادًا جزئيًا بقيمة {amount}', 'corrected proof (shown above)': 'إثباتًا مصحّحًا (معروض أعلاه)',
  'Offer accepted.': 'قُبل العرض.', 'Accept offer': 'قبول العرض', 'Sent to Nashr to decide.': 'أُحيل إلى نشر لتقرر.', 'Decline, ask Nashr to decide': 'رفض، ودع نشر تقرر',
  "Waiting for the publisher's response.": 'بانتظار رد الناشر.', 'Settled: {amount} refunded to your card, VAT included.': 'تمت التسوية: استُرد {amount} إلى بطاقتك، شاملًا الضريبة.',
  'Settled: the ad runs again on {date}.': 'تمت التسوية: يُعاد بث الإعلان في {date}.', 'Settled: corrected proof accepted.': 'تمت التسوية: قُبل الإثبات المصحّح.',
  'Creative': 'المادة الإعلانية', "Due {date} (Dubai time). Technical fixes don't count as a change round.": 'الموعد النهائي {date} (بتوقيت دبي). الإصلاحات الفنية لا تُحتسب جولة تعديل.',
  'Upload a new version': 'ارفع نسخة جديدة', 'Upload your creative': 'ارفع مادتك الإعلانية', 'Timeline': 'السجل الزمني', 'VAT (charged by the publisher)': 'ضريبة القيمة المضافة (يفرضها الناشر)',
  'The publisher accepted. Please pay by {date}.': 'وافق الناشر. يُرجى الدفع قبل {date}.', 'The publisher accepted. Please pay.': 'وافق الناشر. يُرجى الدفع.', 'Card': 'البطاقة',
  'The money is held securely and released to the publisher only after you approve proof that the ad ran. You get a payment receipt from Nashr and a tax invoice from the publisher.':
    'يُحفظ المبلغ بأمان ولا يُحرَّر للناشر إلا بعد موافقتك على إثبات بث الإعلان. تحصل على إيصال دفع من نشر وفاتورة ضريبية من الناشر.',
  'By paying you agree to the': 'بالدفع، فإنك توافق على', 'terms': 'الشروط', 'and the': 'و', 'refund and cancellation policy': 'سياسة الاسترداد والإلغاء', 'Pay {amount}': 'ادفع {amount}',
  "Waiting for the publisher's decision. You'll be asked to pay once they accept.": 'بانتظار قرار الناشر. سيُطلب منك الدفع بعد موافقته.', 'Reason: {reason}': 'السبب: {reason}',
  'Cancel booking…': 'إلغاء الحجز…', 'If you cancel now': 'إذا ألغيت الآن', '(inside the free cancellation window)': '(ضمن فترة الإلغاء المجاني)', 'You paid': 'دفعت',
  'Kept by the publisher (cancellation fee)': 'يحتفظ به الناشر (رسوم الإلغاء)', 'Card processing cost of the refund': 'تكلفة معالجة البطاقة للاسترداد', 'Refunded to your card': 'يُسترد إلى بطاقتك',
  'Confirm cancellation': 'تأكيد الإلغاء', 'Keep the booking': 'الإبقاء على الحجز',

  // Dashboard
  'Pay': 'ادفع', 'Pay to secure the booking': 'ادفع لتأمين الحجز', 'Ad': 'إعلان', 'Send your creative': 'أرسل مادتك الإعلانية', 'Proof': 'إثبات', 'Review the proof': 'راجع الإثبات',
  'Issue': 'مشكلة', 'Answer the publisher': 'ردّ على الناشر', 'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء الخير', 'Find slots': 'ابحث عن مساحات',
  'Held for you now': 'المحفوظ لك الآن', '1 paid booking, released to the publisher only after you approve proof.': 'حجز مدفوع واحد، لا يُحرَّر للناشر إلا بعد موافقتك على الإثبات.',
  '{n} paid bookings, released to publishers only after you approve proof.': '{n} حجوزات مدفوعة، لا تُحرَّر للناشرين إلا بعد موافقتك على الإثبات.',
  'Nothing held: paid bookings appear here until their ad has run.': 'لا شيء محفوظ: تظهر الحجوزات المدفوعة هنا حتى يُبث إعلانها.', 'Paid in the last 30 days:': 'المدفوع في آخر 30 يومًا:',
  'Booked and paid, by week (excluding VAT)': 'المحجوز والمدفوع أسبوعيًا (دون الضريبة)', 'To pay': 'للدفع', 'Nothing': 'لا شيء',
  '1 accepted booking': 'حجز مقبول واحد', '{n} accepted bookings': '{n} حجوزات مقبولة', ', first by': '، أولها قبل', 'Every accepted booking is paid.': 'جميع الحجوزات المقبولة مدفوعة.',
  'Live bids': 'المزايدات الجارية', '{n} leading': '{n} في المقدمة', '{n} outbid': '{n} متجاوَزة', 'No open bids.': 'لا مزايدات مفتوحة.', 'Needs you': 'بحاجة إليك',
  'Payments, creative and proof to review': 'مدفوعات ومواد إعلانية وإثباتات للمراجعة', 'All clear': 'لا شيء معلّق', 'Outlets booked': 'المنصات المحجوزة', '{n} paid bookings so far': '{n} حجوزات مدفوعة حتى الآن',
  'soonest first': 'الأقرب أولًا', 'All bookings': 'كل الحجوزات', 'Nothing waiting on you. New requests appear here once a publisher accepts.': 'لا شيء بانتظارك. تظهر الطلبات الجديدة هنا بعد موافقة الناشر.',
  'by {when}': 'قبل {when}', 'Your bids': 'مزايداتك', 'No open bids. Find a slot on the calendar.': 'لا مزايدات مفتوحة. ابحث عن مساحة في التقويم.', 'airs {date}': 'يُبث {date}',
  'closing': 'يُغلق قريبًا', 'Leading': 'في المقدمة', 'top {price}': 'الأعلى {price}', 'Campaign budgets': 'ميزانيات الحملات', 'No active campaigns.': 'لا حملات نشطة.', 'Plan a campaign': 'خطّط حملة',
  'to track spend against a budget.': 'لمتابعة الإنفاق وفق الميزانية.', '{amount} committed': '{amount} ملتزم به', '{amount} waiting': '{amount} قيد الانتظار', '{amount} left': '{amount} متبقٍ',
  'of {amount}': 'من {amount}', 'Where your budget went (last 90 days, excluding VAT)': 'أين ذهبت ميزانيتك (آخر 90 يومًا، دون الضريبة)', 'No paid bookings in the last 90 days.': 'لا حجوزات مدفوعة في آخر 90 يومًا.',
  '1 booking': 'حجز واحد', '{n} bookings': '{n} حجوزات', 'Coming up on air': 'قريبًا على الهواء', 'Nothing booked to run yet.': 'لا حجوزات للبث بعد.', 'Paid, money held': 'مدفوع، والمبلغ محفوظ',
  'Accepted, waiting for payment': 'مقبول، بانتظار الدفع',

  // Bid window
  'Bidding closes {date}, {time} (Dubai time)': 'تُغلق المزايدة {date}، {time} (بتوقيت دبي)',
  '{n} seconds': '{n} ثانية', 'Asking price': 'السعر المطلوب', 'Current top bid': 'أعلى مزايدة حالية', 'No bids yet': 'لا مزايدات بعد', '{n} bids · bidders anonymous': '{n} مزايدات · المزايدون مجهولو الهوية',
  'Minimum next bid': 'أدنى مزايدة تالية', 'Buy now': 'شراء فوري', 'Request to book: the publisher must accept': 'طلب حجز: يجب أن يوافق الناشر', 'Your bid (excl. VAT)': 'مزايدتك (دون الضريبة)',
  'AED': 'درهم', 'Raise your bid': 'ارفع مزايدتك', 'Auto-bid': 'مزايدة تلقائية', 'Maximum bid': 'الحد الأقصى للمزايدة',
  "We raise your bid in 3% steps when you're outbid, up to this maximum.": 'نرفع مزايدتك بزيادات 3% عندما يتجاوزك آخرون، حتى هذا الحد الأقصى.',
  'Your offer (AED, optional, not below the asking price)': 'عرضك (بالدرهم، اختياري، لا يقل عن السعر المطلوب)', 'Booking brief': 'موجز الحجز', 'Advertiser or brand': 'المعلن أو العلامة التجارية',
  'Industry': 'القطاع', 'What the ad will say': 'محتوى الإعلان', 'Creative language': 'لغة المادة الإعلانية', 'English': 'الإنجليزية', 'Arabic': 'العربية', 'Bilingual': 'ثنائية اللغة',
  'Landing page link': 'رابط الصفحة المقصودة', 'Creative to follow': 'المادة الإعلانية لاحقًا', 'Notes for the publisher': 'ملاحظات للناشر',
  'Emails and phone numbers are not allowed. Talk to the publisher through Nashr.': 'لا يُسمح بعناوين البريد الإلكتروني وأرقام الهواتف. تواصل مع الناشر عبر نشر.', 'Campaign': 'الحملة', 'No campaign': 'بدون حملة',
  "You'll be asked to pay once the publisher accepts. Nothing is charged now.": 'سيُطلب منك الدفع بعد موافقة الناشر. لا يُخصم أي مبلغ الآن.', 'Your bid is in.': 'سُجّلت مزايدتك.',
  'Place bid {amount}': 'زايد بـ{amount}', 'The publisher has your interest.': 'أُبلغ الناشر باهتمامك.', 'Show interest': 'أبدِ اهتمامك',
  'Request sent. The publisher will reply within 24 hours.': 'أُرسل الطلب. سيرد الناشر خلال 24 ساعة.', 'Request at {price}': 'اطلب بـ{price}',
  'Banking': 'المصارف', 'Real estate': 'العقارات', 'Retail': 'التجزئة', 'Technology': 'التقنية', 'Hospitality': 'الضيافة', 'Health': 'الصحة', 'Automotive': 'السيارات', 'Education': 'التعليم',
  'Government': 'الحكومة', 'Other': 'أخرى',

  // Saved searches
  'That saved search was deleted, so the calendar shows every slot.': 'حُذف هذا البحث المحفوظ، لذا يعرض التقويم كل المساحات.', 'Saved. We will alert you when new slots match.': 'تم الحفظ. سننبّهك عند توفّر مساحات جديدة مطابقة.',
  'Saved.': 'تم الحفظ.', 'Deleted “{name}”.': 'حُذف “{name}”.', 'Saved searches': 'عمليات البحث المحفوظة', 'Set the filters below, then save the search to get an alert when new slots match.':
    'حدّد عوامل التصفية أدناه، ثم احفظ البحث لتتلقى تنبيهًا عند توفّر مساحات جديدة مطابقة.',
  'Turn off alerts for {name}': 'إيقاف التنبيهات لـ{name}', 'Turn on alerts for {name}': 'تشغيل التنبيهات لـ{name}', 'Alerts on': 'التنبيهات مفعّلة', 'Alerts off': 'التنبيهات متوقفة',
  'Delete {name}': 'حذف {name}', 'Delete': 'حذف', 'Save this search': 'احفظ هذا البحث', 'Name': 'الاسم', 'Alert me when new slots match': 'نبّهني عند توفّر مساحات جديدة مطابقة', 'Save': 'حفظ',
  'All channels': 'كل القنوات', 'under {price}': 'أقل من {price}', 'morning': 'الصباح', 'afternoon': 'الظهيرة', 'evening': 'المساء', 'all day': 'طوال اليوم', 'auctions': 'المزادات',
  'quick sales': 'البيع السريع', ', ': '، ',

  // Campaigns and media plan
  'Committed and pending against the budget': 'الملتزم به وقيد الانتظار مقابل الميزانية', 'Plan outlets against a budget. Bids and requests tagged to a campaign count against it.':
    'خطّط المنصات وفق ميزانية. تُحتسب المزايدات والطلبات المرتبطة بالحملة من ميزانيتها.', 'New campaign': 'حملة جديدة', 'Budget (AED, excl. VAT)': 'الميزانية (بالدرهم، دون الضريبة)',
  'Launch date': 'تاريخ الإطلاق', 'Objective': 'الهدف', 'Awareness, launch, footfall…': 'الوعي، الإطلاق، زيادة الزوار…', 'Create': 'إنشاء',
  'No campaigns yet. Create one to plan outlets and track spend against a budget.': 'لا حملات بعد. أنشئ حملة لتخطيط المنصات ومتابعة الإنفاق وفق الميزانية.', 'Launch': 'الإطلاق', 'Budget': 'الميزانية',
  'Committed': 'الملتزم به', 'Active': 'نشطة', 'Completed': 'مكتملة', 'Plan saved.': 'حُفظت الخطة.', 'Launches {date}': 'تنطلق في {date}', 'Media plan (PDF)': 'الخطة الإعلامية (PDF)',
  'Mark completed': 'تعيين كمكتملة', 'Reopen': 'إعادة الفتح', 'Awaiting publishers': 'بانتظار الناشرين', 'Remaining': 'المتبقي',
  'Prices excl. VAT. Committed means accepted by the publisher; tag bids to this campaign from the bid drawer.': 'الأسعار دون الضريبة. "الملتزم به" يعني ما وافق عليه الناشر؛ اربط المزايدات بهذه الحملة من نافذة المزايدة.',
  'Plan': 'الخطة', 'Planned (AED)': 'المخطط (بالدرهم)', 'Quote needed': 'يلزم عرض سعر', 'Planned amount': 'المبلغ المخطط', 'Remove {name}': 'إزالة {name}', 'Remove': 'إزالة', 'Add outlet': 'إضافة منصة',
  'Add an outlet…': 'أضف منصة…', 'Add': 'إضافة', 'Save plan': 'حفظ الخطة', 'Nothing booked yet.': 'لا حجوزات بعد.', 'media plan': 'الخطة الإعلامية', 'Back to the campaign': 'العودة إلى الحملة',
  'Print or save as PDF': 'طباعة أو حفظ PDF', 'In the print dialog, choose “Save as PDF”.': 'في نافذة الطباعة، اختر "حفظ كملف PDF".', 'Media plan': 'الخطة الإعلامية', 'Prepared {date}': 'أُعدّت في {date}',
  'Planned': 'المخطط', 'Channel mix': 'توزيع القنوات', 'By outlet in the plan: the amount committed, or the amount planned while that is higher.': 'حسب المنصات في الخطة: المبلغ الملتزم به، أو المبلغ المخطط ما دام أعلى.',
  'The plan': 'الخطة', 'No outlets in the plan yet.': 'لا منصات في الخطة بعد.', 'Outlet and slot': 'المنصة والمساحة',
  'Prices in AED, excluding VAT. Times in Dubai time. Payments are held by Nashr until the publisher proves the ad ran.': 'الأسعار بالدرهم دون الضريبة. الأوقات بتوقيت دبي. تحتفظ نشر بالمدفوعات حتى يُثبت الناشر بث الإعلان.',
  'Figures as of {date}; planned amounts are estimates until a publisher accepts.': 'الأرقام حتى {date}؛ والمبالغ المخططة تقديرية حتى يوافق الناشر.',

  // Charts
  'vs previous 30 days': 'مقارنة بالـ30 يومًا السابقة', 'New: none in the 30 days before': 'جديد: لا شيء في الـ30 يومًا السابقة', 'Value': 'القيمة', 'Week of {week}: {value}': 'أسبوع {week}: {value}',
  'This week': 'هذا الأسبوع', 'Week of {week}': 'أسبوع {week}', 'Show as table': 'عرض كجدول', 'Week of': 'أسبوع',

  // Receipts and invoices
  'Payment receipt': 'إيصال دفع', 'Tax invoice (media)': 'فاتورة ضريبية (إعلام)', 'Commission invoice': 'فاتورة العمولة', 'Credit note': 'إشعار دائن',
  'Payment receipts, tax invoices and credit notes for every booking.': 'إيصالات الدفع والفواتير الضريبية والإشعارات الدائنة لكل حجز.',
  'Nothing yet. You get a receipt from Nashr and a tax invoice from the publisher when you pay.': 'لا شيء بعد. تحصل على إيصال من نشر وفاتورة ضريبية من الناشر عند الدفع.',
  'Document': 'المستند', 'Number': 'الرقم', 'Date': 'التاريخ', 'Tax invoice': 'فاتورة ضريبية', 'Invoice': 'فاتورة', "Publisher's uploaded invoice": 'الفاتورة التي رفعها الناشر',
  'Issued {date}': 'صدرت في {date}', 'Credits {ref}': 'يُقيّد لصالح {ref}', 'TRN': 'الرقم الضريبي', "Issued by Nashr on the publisher's behalf": 'صادرة من نشر نيابةً عن الناشر', 'To': 'إلى',
  'Description': 'الوصف', 'Amount': 'المبلغ', 'Subtotal': 'المجموع الفرعي', 'VAT {rate}%': 'ضريبة القيمة المضافة {rate}%',
  "Payment received by Nashr on behalf of the publisher. This is not a tax invoice; the publisher's tax invoice is issued separately.": 'استلمت نشر الدفعة نيابةً عن الناشر. هذا ليس فاتورة ضريبية؛ تصدر الفاتورة الضريبية للناشر بشكل منفصل.',

  // Athena
  'Athena will turn a campaign brief into a suggested set of bookable slots across UAE media, based on real winning prices, audiences and results on Nashr.':
    'ستحوّل أثينا موجز الحملة إلى مجموعة مقترحة من المساحات القابلة للحجز في وسائل الإعلام الإماراتية، استنادًا إلى الأسعار الفائزة الفعلية والجماهير والنتائج على نشر.',
  "We're collecting that data now with every booking. Until then, plan with": 'نجمع هذه البيانات الآن مع كل حجز. وحتى ذلك الحين، خطّط باستخدام', 'Tell me when Athena launches': 'أبلغني عند إطلاق أثينا',
}
