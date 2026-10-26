/**
 * The words of the After sales and Store user guide.
 * To change the guide: edit this file, then run `npm run build` in this folder (see README.md).
 * Every task is { t: title, intro, steps: [..], note }. Chapters are in the order they appear.
 */
module.exports = {
  title: 'After Sales and Store',
  subtitle: 'User Guide',
  system: 'Ittehad Automotive Dealership Management System',
  dealerships: 'Hyundai Islamabad · Jetour Ittehad · CSM Ittehad',
  audience: 'For: Service Managers, Service Advisors, Technicians, the CRO (service calls), Cashiers, Storekeepers and Store Managers',
  version: 'Version 1.0 · October 2026',

  howToUse: [
    'Each chapter is for one role. Find your role, then the task you want to do. Every task has a heading, a short explanation and numbered steps.',
    'Everyone should read Chapter 1 (Getting started) and Chapter 2 (How a job moves through the workshop and the store) first. After sales and the Store are linked: the parts issued by the Store appear on the job card, and the job card is what the Cashier bills.',
    'Menu names in this guide are written exactly as they appear in the left menu, for example Service visits. If a menu item is not in your menu, your role does not use it (see the access table in Chapter 10).',
    'Jetour Ittehad, Hyundai Islamabad and CSM Ittehad work the same way. Each dealership has its own store and its own stock; the part catalogue and price list are shared by brand.',
  ],

  whoDoesWhat: [
    ['Service Advisor', 'Checks the car in, opens the job card, prepares estimates, asks the Store for parts, raises the invoice draft, hands the car back.'],
    ['Service Manager', 'Everything the Service Advisor does, plus approving estimates, assigning and starting the work, completing job cards, the schedules and the inspection checklist, and the after-sales reports.'],
    ['Technician', 'Works the job cards assigned to them: inspection, ticking the work lines done. (Jetour and Hyundai do not use technician logins at present; the Service Manager does this work.)'],
    ['CRO', 'Calls the customers whose service is due (Services due) and records each call.'],
    ['Cashier', 'Issues the invoice of a finished job card and records the customer payment. Jetour only for now.'],
    ['Storekeeper', 'Receives parts from head office, issues parts to job cards, repair orders and counter sales, takes unused parts back, looks up prices.'],
    ['Store Manager', 'Everything the Storekeeper does, plus adding parts, changing part numbers and prices, bin and reorder level, approving stock adjustments, and the Store report.'],
    ['Dealership Manager / CEO', 'The Dealership Manager can do everything in the dealership. The CEO sees everything in all dealerships, read-only.'],
  ],

  flow: [
    'The customer arrives. The Service Advisor checks the car in (Service visits). The system shows the car, when it was delivered, its earlier visits and whether this visit is a free service.',
    'The Service Advisor opens the job card on the visit, writes the complaints and the work to do.',
    'The Service Manager assigns a technician and clicks Start work (the visit becomes In progress).',
    'If extra work is found, the Service Advisor prepares an estimate; the Service Manager approves it once the customer agrees, and the approved lines are added to the job card.',
    'The Storekeeper issues the parts to the job card (Issue parts). They appear on the job card as parts, at the customer price, with any discount.',
    'When the work is done, each line is ticked Done and the job card is completed (the visit becomes Ready).',
    'The Cashier creates and issues the invoice from the job card and records the payment.',
    'The Service Advisor hands the car back to the customer (the visit becomes Delivered). The next service is set from the service schedule.',
    'Later, the CRO sees the car on Services due and calls the customer.',
  ],

  chapters: [
    {
      title: 'Getting started (all users)',
      intro: 'These tasks are the same for every user: logging in, the dashboard, notifications and logging out.',
      tasks: [
        {
          t: 'Log in',
          intro: 'Open the portal in your browser (Google Chrome recommended) and sign in with the email and password given to you by your Manager.',
          steps: ['Type your email address and password, then click Log In.'],
          note: 'Forgot your password? Ask your Manager or the System Admin to reset it.',
        },
        {
          t: 'Use the menu',
          intro: 'The menu on the left shows only the screens your role may use. The After sales and Store (parts) groups open and close when you click their name.',
          steps: [
            'After sales holds Services due (call list), Service visits, Job cards, Estimates, Service schedules and Inspection checklist.',
            'Store (parts) holds Store stock, Receive parts, Issue parts (RO / job card), Store report, Price list, Parts and prices, Goods receipts, Adjustments, Stock movements and Suppliers.',
          ],
        },
        {
          t: 'Notifications and signing out',
          intro: 'The bell shows new notifications. Always sign out when you leave a shared computer.',
          steps: ['Click the bell to see notifications.', 'Click your name at the top right, then Sign out. “My account” in the same menu lets you change your password.'],
        },
      ],
    },
    {
      title: 'How a job moves through the workshop and the store',
      intro: 'This chapter is the whole picture. The other chapters explain each person’s part in detail.',
      flowSteps: true,
      tasks: [
        {
          t: 'Free services and what the customer pays',
          intro: 'Some scheduled services are free for the customer, but only the labour.',
          steps: [
            'The free check-up at 1,000 km and the first service at 5,000 km are free of labour. A visit that is a free service shows a green Free badge.',
            'On a free service the parts and the oil are always charged to the customer. On the job card they show “Charged to the customer”, and the labour shows “Free of charge”.',
            'The job card summary shows: Parts and oil (charged), Labour (charged), Free of charge, Discount given and what the Customer pays.',
          ],
          note: 'The later services (10,000 km, 20,000 km, 30,000 km) are set up as placeholders until the free-service plan is confirmed. The Service Manager can change them under Service schedules.',
        },
        {
          t: 'Status of a visit, a job card and an estimate',
          intro: 'Each record shows its status as a coloured label.',
          steps: [
            'Service visit: Checked in → In progress → Ready → Delivered (or Cancelled while only Checked in).',
            'Job card: Open → In progress → Completed (or Cancelled).',
            'Estimate: Draft → Awaiting approval → Approved (or Rejected; a rejected estimate can be revised).',
          ],
        },
      ],
    },
    {
      title: 'Service Advisor',
      intro: 'The Service Advisor is the customer’s contact in the workshop: checks the car in, opens the job card, prepares estimates, asks for parts and hands the car back.',
      login: 'Example login: advisor.jetour@dms.local',
      tasks: [
        {
          t: 'Check a car in',
          intro: 'Every visit starts with a check-in. The system looks the car up and tells you about it before you save.',
          steps: [
            'Click Service visits in the menu, then the button to create a new visit.',
            'Choose the vehicle (search by registration or chassis number). The check-in summary shows the car, the date it was delivered, its earlier visits and whether this is a free service.',
            'Choose the visit type: Scheduled service, Paid service, Repair, Warranty, Accident or Inspection only.',
            'Enter the odometer reading in km and, in the complaints box, what the customer said. Leave the customer empty to use the owner on record.',
            'Save. The visit gets a visit number and the status Checked in.',
          ],
          note: 'A car that is already checked in and not yet handed back cannot be checked in again.',
        },
        {
          t: 'Register a car bought elsewhere',
          intro: 'If the car is not in the system (it was bought from another dealer), register it at the check-in.',
          steps: [
            'On the new-visit screen, if the vehicle search finds nothing, open “Register a car bought elsewhere”.',
            'Fill in the customer name, mobile (digits only, e.g. 03001234567), CNIC, address, the model, variant, colour, model year, registration number, chassis number (VIN) and engine number, and who it was bought from.',
            'If the car is under warranty, fill in “Warranty ends on”. Save: the car and customer are created and chosen for the visit.',
          ],
          note: 'The visit is then marked as a car bought elsewhere, so it is never counted as one of our deliveries.',
        },
        {
          t: 'Open the job card and write the work',
          intro: 'The job card is the workshop’s record of the visit: the work, the parts and what the customer pays.',
          steps: [
            'Open the visit. In the Job card section, open the job card for the visit. It gets a job card number.',
            'In the Work section, add the lines: choose Labour or Part, write the description, the quantity and the unit price. A line can have a discount in per cent.',
            'Lines that come from the schedule, an approved estimate or the Store are locked and shown with a note. Only the lines you typed can be changed or removed.',
          ],
          note: 'Parts that the Store issues to this job card are added automatically. You do not type them.',
        },
        {
          t: 'Prepare an estimate for extra work',
          intro: 'When extra work is found, the customer must agree first. The estimate records the price you quoted.',
          steps: [
            'Open the job card and go to Estimates, then create an estimate.',
            'Add the lines (labour and parts) with their prices and discount, check the total.',
            'Click Submit for approval. The Service Manager approves it once the customer agrees; the lines then move to the job card.',
          ],
          note: 'A rejected estimate shows the reason; click Revise to correct it and submit again. A job card cannot be completed while an estimate is still waiting for approval.',
        },
        {
          t: 'Ask the Store for parts',
          intro: 'Parts requests tell the Store what the job needs.',
          steps: [
            'On the job card, in Parts requests, enter the part number and the quantity and add the request.',
            'The Storekeeper sees the request and issues the parts to the job card. They appear in the Work section as parts.',
          ],
        },
        {
          t: 'Start the inspection',
          intro: 'The inspection is the checklist for the car (Inspection checklist in the menu).',
          steps: ['On the job card, open Inspection, start it and record the result of each point with a note where needed.'],
        },
        {
          t: 'Read the job card summary and print it',
          intro: 'The job card summary shows everything on one page: customer, car, odometer, complaints, every line and the totals.',
          steps: [
            'Open the job card and scroll to the Job card summary section.',
            'Check the totals: parts and oil, labour, free of charge, discount given, and what the customer pays.',
            'Click Print job card (PDF) to download a printable job card with signature lines for the advisor and the customer.',
          ],
        },
        {
          t: 'Hand the car back',
          intro: 'When the job card is completed the visit is Ready. Handing back closes the visit.',
          steps: [
            'Open the visit (status Ready) and click Hand back to customer.',
            'The visit becomes Delivered. The car’s last service date is updated and the schedule entry is marked done.',
          ],
          note: 'Billing is done by the Cashier (Chapter 7). At dealerships with no Cashier, the Accountant or Manager issues the invoice and takes the payment.',
        },
      ],
    },
    {
      title: 'Service Manager',
      intro: 'The Service Manager runs the workshop. Everything a Service Advisor does, the Service Manager can do too, plus the tasks below. With no technician logins at present, the Service Manager also does the technician’s work in the system.',
      login: 'Example login: servicemanager@jetour.com (Hyundai and CSM share one Service Manager: servicemanager@hyundai.com)',
      tasks: [
        {
          t: 'Assign the work and start it',
          intro: 'A job card cannot start until someone is assigned to it.',
          steps: [
            'Open the job card and choose the person under Technician. The list shows only users who can work job cards at this dealership; the Service Manager is on the list.',
            'Click Start work. The job card and the visit become In progress.',
          ],
          note: 'The system refuses to start a job card with the message “Assign a technician first” if nobody is chosen.',
        },
        {
          t: 'Mark the work done and complete the job card',
          intro: 'Each line is ticked off when its work is finished.',
          steps: [
            'In the Work section, tick the Done box on each line when the work is finished. Parts issued by the Store are already ticked.',
            'When every line is done, click Complete job card. The visit becomes Ready.',
          ],
          note: 'You cannot complete a job card that has no lines, still has lines not done, or has an estimate waiting for approval. The message tells you which.',
        },
        {
          t: 'Approve or reject an estimate',
          intro: 'Approve only after the customer has agreed to the price.',
          steps: [
            'Click Estimates in the menu and open an estimate that is Awaiting approval.',
            'Click Approve (customer agreed) to add its lines to the job card, or Reject and write the reason.',
          ],
        },
        {
          t: 'Keep the service schedules and inspection checklist',
          intro: 'The schedules say which services a car is due for and at how many km; the checklist is the list of inspection points.',
          steps: [
            'Click Service schedules to see or change the services (name, km, whether the labour is free).',
            'Click Inspection checklist to add or change the inspection points.',
          ],
          note: 'These are shared by the whole group and need a group-level right. Ask the System Admin if a change is refused.',
        },
        {
          t: 'See all visits, job cards and the reports',
          intro: 'The Service Manager sees every visit, job card and estimate of the dealership.',
          steps: [
            'Service visits, Job cards and Estimates list everything; use the status boxes and filters to narrow the list.',
            'The after-sales report figures are in the reports for the Service Manager.',
          ],
        },
        {
          t: 'See the parts and prices',
          intro: 'The Service Manager can look at the price list and the stock but cannot change them; that is the Store Manager’s work.',
          steps: ['Click Price list to look up the price of any part by code or name, and Store stock to see what is in the store.'],
        },
      ],
    },
    {
      title: 'Technician',
      intro: 'The Technician works the job cards assigned to them. Jetour and Hyundai do not use technician logins at present (the Service Manager does this work); CSM keeps one. This chapter is for any dealership that starts using technician logins.',
      login: 'Example login: tech.csm@dms.local',
      tasks: [
        {
          t: 'See my job cards',
          intro: 'The Technician sees only the job cards and the inspections, and the vehicle details they need. They do not see customers, prices, estimates or the Store.',
          steps: ['Click Job cards in the menu and open the job card assigned to you.'],
        },
        {
          t: 'Start work, tick lines done and complete',
          intro: 'The same steps as the Service Manager (Chapter 4).',
          steps: [
            'Click Start work when you begin.',
            'Tick Done on each line when it is finished.',
            'Do the inspection and record each point.',
            'Click Complete job card when every line is done.',
          ],
        },
      ],
    },
    {
      title: 'CRO: services due',
      intro: 'After sales gives the CRO a call list: the cars whose next service is due soon or overdue. The CRO calls the customer and records the call.',
      login: 'Example login: cro1@jetour.com',
      tasks: [
        {
          t: 'Call the customers whose service is due',
          intro: 'Services due (call list) in the After sales menu shows who to call.',
          steps: [
            'Click Services due (call list). Choose the dealership if you have more than one, and “Due within” how many days.',
            'Tick “Overdue and today only” to see only the urgent ones. The list shows the customer, the car, the service due, whether it is free, and the last call (or Not called yet).',
            'Call the customer. Click the row to record the call: write what the customer said under “What the customer said” and any remarks, and save.',
            'Earlier calls on the same car are listed so nobody calls twice for the same thing.',
          ],
          note: 'The CRO can also see the customer’s visits and job cards, but cannot change them.',
        },
      ],
    },
    {
      title: 'Cashier',
      intro: 'The Cashier takes the money at the counter: issues the invoice of a finished job card and records the payment. The Cashier cannot change stock, prices or job cards. Jetour has a Cashier; Hyundai and CSM have none at present (the Accountant does this work).',
      login: 'Example login: cashier@jetour.com',
      tasks: [
        {
          t: 'Create the invoice from a job card',
          intro: 'The invoice comes straight from the job card, so nothing is typed twice.',
          steps: [
            'Click Job cards, open the finished job card (status Completed).',
            'In the Invoice section, click Create invoice. The invoice is made from the job card’s charged lines: parts, oil and labour that the customer pays. Free labour is not on the invoice.',
            'Open the invoice (Invoices in the Accounts menu) and check the amount against the job card summary.',
          ],
        },
        {
          t: 'Issue the invoice and record the payment',
          intro: 'Issuing makes the invoice final. The payment closes it.',
          steps: [
            'Open the invoice and click Issue.',
            'Click Payments, record the amount and how it was paid (cash, card or transfer), and save.',
            'The invoice shows Paid when the full amount has been received.',
          ],
          note: 'Only the Accountant or Manager can void an invoice or a payment.',
        },
      ],
    },
    {
      title: 'Storekeeper',
      intro: 'The Storekeeper runs the store desk: receives parts, issues them to job cards and takes unused parts back. The Storekeeper cannot change prices or part numbers.',
      login: 'Example login: store@jetour.com',
      tasks: [
        {
          t: 'See what is in the store',
          intro: 'Store stock lists every part with what is in the store now and what came in and went out this month.',
          steps: [
            'Click Store stock. Search by part number or name; filter by Vehicle, Category and Brand.',
            'Use Show to see only Low stock (at or below the reorder level) or all parts, including those with none in stock.',
            'Click Receive parts or Issue parts at the top to go straight to those screens.',
          ],
        },
        {
          t: 'Look up a price',
          intro: 'The Price list shows the price of any part.',
          steps: [
            'Click Price list and search by part code or part name; filter by vehicle, category or brand.',
            'Customer price (with sales tax) is what the customer pays. The received price (from the company) and the MRP without sales tax are shown beside it.',
          ],
        },
        {
          t: 'Receive parts from head office',
          intro: 'Record every delivery so the stock and the received price are correct.',
          steps: [
            'Click Receive parts.',
            'Fill in “Received from”, the invoice / challan number and the “Received on” date. Choose the store.',
            'Add each part with its quantity and the price per piece (PKR). Check the Amount.',
            'Save. The stock goes up, and the part’s received price is updated to this price.',
          ],
          note: 'Every delivery appears under Goods receipts. If a mistake is found later, ask the Store Manager to correct it with an adjustment.',
        },
        {
          t: 'Issue parts to a job card, repair order or counter sale',
          intro: 'Every part that leaves the store is recorded against a job, so the customer is charged and the stock stays right.',
          steps: [
            'Click Issue parts (RO / job card).',
            'Choose what the parts are for: an Open job card (the list shows only open job cards of this dealership), a Repair order (RO) number, or a Counter sale (no repair order).',
            'Add each part and the quantity. The price charged is the customer price; you may change it for a line.',
            'To give a discount, enter a percentage on the line, or in “Discount on all parts (%)” to apply one rate to every part. Enter the invoice number and any remarks.',
            'Click Issue from stock. The stock goes down. For a job card, the parts are added to its Work section at the price after the discount.',
          ],
          note: 'Parts can only be issued to an open or in-progress job card. A discount is a percentage, normally 1% to 5%.',
        },
        {
          t: 'Take unused parts back',
          intro: 'If parts were issued but not used, return them against the same job card.',
          steps: [
            'On Issue parts (RO / job card), click “Unused parts back to stock” at the top, then choose the same job card or RO.',
            'Enter the part and quantity. You cannot take back more than was issued to that job card.',
            'Click Return to stock. The stock goes up and the line on the job card is reduced or removed.',
          ],
        },
        {
          t: 'Stock adjustments, movements, receipts and suppliers',
          intro: 'These screens show the history and let the Storekeeper prepare corrections.',
          steps: [
            'Goods receipts lists every delivery received. Stock movements lists every part in and out, with who did it.',
            'Adjustments: prepare an adjustment when the count differs from the system (a damaged or missing part). It is only posted once the Store Manager approves it.',
            'Suppliers lists the suppliers; the Storekeeper can look but not change them.',
          ],
        },
        {
          t: 'Answer the workshop’s parts requests',
          intro: 'The advisor’s parts requests show what a job card needs.',
          steps: ['Open the job card’s Parts requests, or go straight to Issue parts and choose that job card, and issue what was asked for.'],
        },
      ],
    },
    {
      title: 'Store Manager',
      intro: 'The Store Manager runs the store. Everything the Storekeeper does, the Store Manager can do too, plus the tasks below.',
      login: 'Example login: storemanager@jetour.com',
      tasks: [
        {
          t: 'Add a new part',
          intro: 'The part catalogue is shared by the group, but a Store Manager changes only the parts of their own brand.',
          steps: [
            'Click Parts and prices, then Add part.',
            'Enter the part number, description, category, the received price (PKR) and the customer price (PKR), and choose the vehicle it fits.',
            'Save. Each change is recorded with the name of the person who made it.',
          ],
        },
        {
          t: 'Change a part number or a price',
          intro: 'Prices and part numbers are changed in one place only.',
          steps: ['Click Parts and prices, search for the part, open it, change the part number, description, category or either price and save.'],
        },
        {
          t: 'Raise or lower prices by a percentage',
          intro: 'When the company changes its prices, change a whole brand, or one category of it, at once.',
          steps: [
            'On Parts and prices, open “Raise or lower prices”.',
            'Choose the brand and, if needed, one category. Enter the change in per cent (a minus sign lowers the prices).',
            'Read the example shown, then confirm.',
          ],
          note: 'Check the example before confirming. Every price changed is recorded in the activity log.',
        },
        {
          t: 'Set which vehicle a part fits',
          intro: 'The Vehicle filter in Store stock and the Price list depends on this.',
          steps: [
            'On Parts and prices, open “Set the vehicle of parts by part code”.',
            'Choose how many characters at the start of the part code to group by. Each group shows its vehicle models.',
            'Pick the group, choose the vehicle models and save: every part whose code starts with those characters is assigned.',
          ],
        },
        {
          t: 'Set the bin and the reorder level',
          intro: 'The bin says where a part is kept; the reorder level is the quantity at or below which the part shows as Low.',
          steps: [
            'On Store stock, open a part’s settings.',
            'Choose the store, type the bin / shelf (for example A-3-2) and the reorder level (0 means no alert), and save.',
          ],
        },
        {
          t: 'Approve a stock adjustment',
          intro: 'An adjustment changes the stock, so only the Store Manager can post it.',
          steps: [
            'Click Adjustments and open one prepared by the Storekeeper.',
            'Check the reason and the quantities, then Approve to post it, or Reject.',
          ],
        },
        {
          t: 'Read the Store report',
          intro: 'The Store report shows what the store received, issued and earned.',
          steps: [
            'Click Store report. Choose the dealership, store, and from / to month.',
            'Month by month and By category show received (cost), issued (cost), taken back, revenue and margin. Revenue is after discounts.',
            'The sale list shows every part issued: invoice number, RO or job card, part, quantity, price and remarks. Search by invoice number, RO, part code or name.',
            'Earlier sales shows the sales recorded before the system started.',
          ],
        },
        {
          t: 'Purchase orders, transfers and suppliers',
          intro: 'The Store Manager can also keep suppliers, raise and approve purchase orders and move stock between stores.',
          steps: ['Suppliers: add or change a supplier. Transfers: prepare, dispatch and receive stock between branches.'],
        },
      ],
    },
    {
      title: 'Dealership Manager and CEO',
      intro: 'The Dealership Manager has every right in one dealership. The CEO sees every dealership, read-only.',
      tasks: [
        {
          t: 'Dealership Manager',
          intro: 'Can do everything in the After sales and Store menus, including voiding an invoice or payment and maintaining the schedules and checklist.',
          steps: ['Use the same screens as the roles in this guide. For daily work, let the Service Manager and the Store Manager do their own tasks so each action is recorded against the right person.'],
        },
        {
          t: 'CEO',
          intro: 'The CEO’s portal is read-only and covers all three dealerships.',
          steps: [
            'Open Service visits, Job cards, Estimates, Services due, Store stock, Goods receipts, Price list, Store report, Invoices and Payments to see the figures.',
            'The CEO cannot create, change or approve anything. Open the Activity log to see who did what.',
          ],
        },
      ],
    },
  ],

  /** Chapter 10: who can do what. Columns: Service Mgr, Advisor, Technician, CRO, Cashier, Storekeeper, Store Mgr, Dealership Mgr, CEO. */
  accessColumns: ['Service Manager', 'Service Advisor', 'Technician', 'CRO', 'Cashier', 'Storekeeper', 'Store Manager', 'Dealership Manager', 'CEO'],
  access: [
    ['Check a car in / register a car bought elsewhere', 'Yes', 'Yes', '–', '–', '–', '–', '–', 'Yes', '–'],
    ['See service visits', 'Yes', 'Yes', '–', 'Yes', 'Yes', '–', '–', 'Yes', 'Yes'],
    ['Hand the car back to the customer', 'Yes', 'Yes', '–', '–', '–', '–', '–', 'Yes', '–'],
    ['Open a job card, add lines', 'Yes', 'Yes', '–', '–', '–', '–', '–', 'Yes', '–'],
    ['See job cards', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', '–', '–', 'Yes', 'Yes'],
    ['Assign, start, tick done, complete', 'Yes', '–', 'Yes', '–', '–', '–', '–', 'Yes', '–'],
    ['Inspections', 'Yes', 'Yes', 'Yes', '–', '–', '–', '–', 'Yes', 'View'],
    ['Prepare / submit an estimate', 'Yes', 'Yes', '–', '–', '–', '–', '–', 'Yes', '–'],
    ['Approve / reject an estimate', 'Yes', '–', '–', '–', '–', '–', '–', 'Yes', '–'],
    ['Service schedules / checklist (change)', 'Yes', 'View', 'View', '–', '–', '–', '–', 'Yes', 'View'],
    ['Services due: see and record calls', 'Yes', 'Yes', '–', 'Yes', '–', '–', '–', 'Yes', 'View'],
    ['Request parts for a job card', 'Yes', 'Yes', '–', '–', '–', 'View', 'Yes', 'Yes', 'View'],
    ['Price list / store stock (look)', 'Yes', 'Yes', '–', '–', '–', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Receive parts', '–', '–', '–', '–', '–', 'Yes', 'Yes', 'Yes', '–'],
    ['Issue parts / take back', '–', '–', '–', '–', '–', 'Yes', 'Yes', 'Yes', '–'],
    ['Prepare a stock adjustment', '–', '–', '–', '–', '–', 'Yes', 'Yes', 'Yes', '–'],
    ['Approve a stock adjustment', '–', '–', '–', '–', '–', '–', 'Yes', 'Yes', '–'],
    ['Add parts, change part numbers and prices', '–', '–', '–', '–', '–', '–', 'Yes', 'Yes', '–'],
    ['Bin and reorder level', '–', '–', '–', '–', '–', '–', 'Yes', 'Yes', '–'],
    ['Store report', '–', '–', '–', '–', '–', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Create an invoice from a job card', 'Yes', 'Yes', '–', '–', 'Yes', '–', '–', 'Yes', 'View'],
    ['Issue the invoice, record payment', '–', '–', '–', '–', 'Yes', '–', '–', 'Yes', 'View'],
    ['Void an invoice or payment', '–', '–', '–', '–', '–', '–', '–', 'Yes', '–'],
  ],

  changing: [
    'This guide is made from the file content.js in the folder documents/guide-source. To add or change anything, edit the text in content.js (each task is a title, a short explanation, numbered steps and an optional note) and run the build command in that folder. The new Word file replaces the old one.',
    'If a screen or a role’s rights change in the system (for example a new report, or a role gets a new right), update the matching task and the access table in Chapter 10, and change the version line at the top of content.js.',
    'The roles and their rights are in backend/src/modules/core/defaultRoles.ts. The System Admin can also change a role’s rights in the portal (Roles & permissions); the access table shows the standard setup.',
  ],

  openItems: [
    'What the CRO should do in after sales beyond the services-due call list.',
    'The real free-service plan after 5,000 km (the 10,000 / 20,000 / 30,000 km entries are placeholders).',
    'Which part-code groups belong to which vehicle (F16, F18, F01, F27 and so on).',
    'The labour price list.',
    'A Cashier and a Store Manager for Hyundai and CSM.',
  ],
};
