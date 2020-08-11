require("dotenv").config();
import homepageService from "../services/homepageService";
import chatbotService from "../services/chatbotService";
import templateMessage from "../services/templateMessage";

const MY_VERIFY_TOKEN = process.env.MY_VERIFY_TOKEN;

let call = "";//me
let step = 1;

let setCall = (val) => {
    call = val;
};

let email;//me

let name="";//me

let getHomePage = (req, res) => {
    return res.render("homepage.ejs")
};

let getWebhook = (req, res) => {
    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = MY_VERIFY_TOKEN;

    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {

        // Checks the mode and token sent is correct
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {

            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);

        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
};

let postWebhook = (req, res) => {
    let body = req.body;

    // Checks this is an event from a page subscription
    if (body.object === 'page') {

        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function(entry) {
            //check the incoming message from primary app or not; if secondary app, exit
            if (entry.standby) {
                //if user's message is "back" or "exit", return the conversation to the bot
                let webhook_standby = entry.standby[0];
                if(webhook_standby && webhook_standby.message){
                    if (webhook_standby.message.text === "back" || webhook_standby.message.text === "exit") {
                        // call function to return the conversation to the primary app
                        // chatbotService.passThreadControl(webhook_standby.sender.id, "primary");
                        chatbotService.takeControlConversation(webhook_standby.sender.id);
                    }
                }

                return;
            }

            // Gets the body of the webhook event
            let webhook_event = entry.messaging[0];
            console.log(webhook_event);

            // Get the sender PSID
            let sender_psid = webhook_event.sender.id;

            // Check if the event is a message or postback and
            // pass the event to the appropriate handler function
            if (webhook_event.message) {

                if (webhook_event.message.text && call!=="") {

                    switch (call) {
                        case "SUB_EMAIL":
                            handleSubEmail(sender_psid, webhook_event.message);
                            break;
                        case "TALK_AGENT":
                            handleTalkAgent(sender_psid, webhook_event.message);
                            break;
                        case "TALK_AGENT2":
                            handleTalkAgent2(sender_psid, webhook_event.message);
                            break;
                        case "ORDER_LOOKUP":
                            handleSubEmail(sender_psid, webhook_event.message);
                            break;
                    }

                } else {
                    handleMessage(sender_psid, webhook_event.message);
                }
            } else if (webhook_event.postback) {
                handlePostback(sender_psid, webhook_event.postback);
            }
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
};

//adding nlp recognition
function firstTrait(nlp, name) {
    return nlp && nlp.entities && nlp.traits[name] && nlp.traits[name][0];
}

// Handles messages events
let handleMessage = async (sender_psid, received_message) => {
    //check the incoming message is a quick reply?
    if (received_message && received_message.quick_reply && received_message.quick_reply.payload) {
        let payload = received_message.quick_reply.payload;
        if (payload === "CATEGORIES") {
            await chatbotService.sendCategories(sender_psid);

        } else if (payload === "LOOKUP_ORDER") {
            await chatbotService.sendLookupOrder(sender_psid);

        } else if (payload === "TALK_AGENT") {
            call="TALK_AGENT";
            step=1;
            await chatbotService.sendTalkAgent(sender_psid);
            //await chatbotService.requestTalkToAgent(sender_psid);
        }


        return;
    }


    let response;

    // Check if the message contains text
    if (received_message.text) {
        // Create the payload for a basic text message
        // check greeting is here and is confident
        const greeting = firstTrait(received_message.nlp, 'wit$greetings');
        const thanks = firstTrait(received_message.nlp, 'wit$thanks');
        const bye = firstTrait(received_message.nlp, 'wit$bye');

        if (greeting && greeting.confidence > 0.8) {
            response = {
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"button",
                        "text":"Hello there! If you need any assistance click the button below.",
                        "buttons":[
                            {
                                "type": "postback",
                                "title": "Main Menu",
                                "payload": "BACK_TO_MAIN_MENU"
                            }
                        ]
                    }
                }
            }
        } else if (thanks && thanks.confidence > 0.8) {
            response = {
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"button",
                        "text":"You're Welcome! Is there anything else I can help you out with?",
                        "buttons":[
                            {
                                "type": "postback",
                                "title": "Main Menu",
                                "payload": "BACK_TO_MAIN_MENU"
                            }
                        ]
                    }
                }
            }
        } else if (bye && bye.confidence > 0.8) {
            response = {
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"button",
                        "text":"Goodbye. If you need anything else, I'm always here to help.",
                        "buttons":[
                            {
                                "type": "postback",
                                "title": "Main Menu",
                                "payload": "BACK_TO_MAIN_MENU"
                            }
                        ]
                    }
                }
            }
        } else {
            response = {
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"button",
                        "text":`Sorry I cannot understand "${received_message.text}".` + `\n\nPlease use the menu below to see what I can do or speak to an agent if you need additional assistance.`,
                        "buttons":[
                            {
                                "type": "postback",
                                "title": "Main Menu",
                                "payload": "BACK_TO_MAIN_MENU"
                            },
                            {
                                "type": "postback",
                                "title": "Speak with an Agent",
                                "payload": "TALK_AGENT"
                            }
                        ]
                    }
                }
            }
        }
    } else if (received_message.attachments) {
        // Get the URL of the message attachment
        let attachment_url = received_message.attachments[0].payload.url;
        response = {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": [ {
                        "title": "Is this the right picture?",
                        "subtitle": "Tap a button to answer.",
                        "image_url": attachment_url,
                        "buttons": [
                            {
                                "type": "postback",
                                "title": "Yes!",
                                "payload": "BACK_TO_MAIN_MENU",
                            },
                            {
                                "type": "postback",
                                "title": "No!",
                                "payload": "BACK_TO_MAIN_MENU",
                            }
                        ],
                    } ]
                }
            }
        }
    }

    // Sends the response message
    await chatbotService.sendMessage(sender_psid, response);
};

// Handles messaging_postbacks events
let handlePostback = async (sender_psid, received_postback) => {
    // Get the payload for the postback
    let payload = received_postback.payload;

    // Set the response based on the postback payload
    switch (payload) {
        case "GET_STARTED":
        case "RESTART_CONVERSATION":
            await chatbotService.sendMessageWelcomeNewUser(sender_psid);
            break;
        case "TALK_AGENT":
            call="TALK_AGENT";
            step=1;
            await chatbotService.sendTalkAgent(sender_psid);
            //await chatbotService.requestTalkToAgent(sender_psid);
            break;
        case "SHOW_HEADPHONES":
            await chatbotService.showHeadphones(sender_psid);
            break;
        case "SHOW_TV":
            await chatbotService.showTVs(sender_psid);
            break;
        case "SHOW_PLAYSTATION":
            await chatbotService.showPlaystation(sender_psid);
            break;
        case "BACK_TO_CATEGORIES":
            await chatbotService.backToCategories(sender_psid);
            break;
        case "BACK_TO_MAIN_MENU":
            call="";
            await chatbotService.backToMainMenu(sender_psid);
            break;
        case "SUB_EMAIL":
            call = "SUB_EMAIL";
            await chatbotService.sendSubEmail(sender_psid);
            break;
        default:
            console.log("run default switch case")

    }
};

let handleSetupProfile = async (req, res) => {
    try {
        await homepageService.handleSetupProfileAPI();
        return res.redirect("/");
    } catch (e) {
        console.log(e);
    }
};

let getSetupProfilePage = (req, res) => {
    return res.render("profile.ejs");
};

let getInfoOrderPage = (req, res) => {
    let facebookAppId = process.env.FACEBOOK_APP_ID;
    return res.render("infoOrder.ejs", {
        facebookAppId: facebookAppId
    });
};

let setInfoOrder = async (req, res) => {
    try {
        let customerName = "";
        if (req.body.customerName === "") {
            customerName = "Empty";
        } else customerName = req.body.customerName;

        // I demo response with sample text
        // you can check database for customer order's status

        let response1 = {
            "text": `---Info about your lookup order---
            \nCustomer name: ${customerName}
            \nEmail address: ${req.body.email}
            \nOrder number: ${req.body.orderNumber}
            `
        };

        let response2 = templateMessage.setInfoOrderTemplate();

        await chatbotService.sendMessage(req.body.psid, response1);
        await chatbotService.sendMessage(req.body.psid, response2);

        return res.status(200).json({
            message: "ok"
        });
    } catch (e) {
        console.log(e);
    }
};

function validateEmail(email) { //by me
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

let handleSubEmail = async (sender_psid, received_message) => {

    let response;

    // Check if the message contains text
    if (validateEmail(received_message.text)) {
        // Create the payload for a basic text message
        email=received_message.text;

        //use MailChimp api to add this email

        //if email is now successfully in the mailing list send success message
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text": `Yeehaw. You just signed up: ${email}`+"\n\nStill need help? Press the menu button below.",
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Menu",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
        call="";//reset the call if email was added
    } else {
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text":"Please enter a valid email.",
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Cancel",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
    }

    // Sends the response message
    await chatbotService.sendMessage(sender_psid, response);
};

let handleTalkAgent = async (sender_psid, received_message) => {

    let response;
if (step===1) {
    // Check if the message contains text
    if (validateEmail(received_message.text)) {
        // Create the payload for a basic text message
        email = received_message.text;
        //setCall("TALK_AGENT2");
        //use ZenDesk api to open ticket with this email

        let ticketTemplate = {
            "ticket": {
                "subject": "Hello",
                "comment": {"body": "Some question"},
                "requester": {"locale_id": 8, "name": "Pablo", "email": "pablito@example.org"}
            }
        }

        //if email is now successfully in the mailing list send success message
        response = {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": `Got it, Now what's your name?`,
                    "buttons": [
                        {
                            "type": "postback",
                            "title": "Cancel",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }

//        setCall("TALK_AGENT2");
        //call="TALK_AGENT2";//reset the call if email was added
        step++;//step=2

        //can add another call to collect more data ex. TALK_AGENT_getName and TALK_AGENT_getDescription
    } else {
        response = {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": "Please enter a valid email.",
                    "buttons": [
                        {
                            "type": "postback",
                            "title": "Cancel",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
    }
}else if (step===2){
    if ((received_message.text)) {
        // Create the payload for a basic text message
        name=received_message.text;

        //use ZenDesk api to open ticket with this email

        let ticketTemplate = {
            "ticket": {
                "subject":   "Hello",
                "comment":   { "body": "Some question" },
                "requester": { "locale_id": 8, "name": "Pablo", "email": "pablito@example.org" }
            }
        }

        //if email is now successfully in the mailing list send success message
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text": `Alright ${name}, Somebody will get back to at ${email} within 1-2 business days.`+"\n\nTo continue using the automated menu, use the button below.",
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Menu",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
//        call="";//reset the call if email was added
//        step++;//step=3
        //can add another call to collect more data ex. TALK_AGENT_getName and TALK_AGENT_getDescription
    } else {
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text":"Enter your name again please.",
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Cancel",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
    }
}

    // Sends the response message
    await chatbotService.sendMessage(sender_psid, response);
};

let handleTalkAgent2 = async (sender_psid, received_message) => {

    let response;

    // Check if the message contains text
    if ((received_message.text)) {
        // Create the payload for a basic text message
        name=received_message.text;

        //use ZenDesk api to open ticket with this email

        let ticketTemplate = {
            "ticket": {
                "subject":   "Hello",
                "comment":   { "body": "Some question" },
                "requester": { "locale_id": 8, "name": "Pablo", "email": "pablito@example.org" }
            }
        }

        //if email is now successfully in the mailing list send success message
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text": `Hi ${name} within 1-2 business days.`,
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Menu",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
        call="";//reset the call if email was added

        //can add another call to collect more data ex. TALK_AGENT_getName and TALK_AGENT_getDescription
    } else {
        response = {
            "attachment":{
                "type":"template",
                "payload":{
                    "template_type":"button",
                    "text":"Error",
                    "buttons":[
                        {
                            "type": "postback",
                            "title": "Cancel",
                            "payload": "BACK_TO_MAIN_MENU"
                        }
                    ]
                }
            }
        }
    }

    // Sends the response message
    await chatbotService.sendMessage(sender_psid, response);
};

module.exports = {
    getHomePage: getHomePage,
    getWebhook: getWebhook,
    postWebhook: postWebhook,
    handleSetupProfile: handleSetupProfile,
    getSetupProfilePage: getSetupProfilePage,
    getInfoOrderPage: getInfoOrderPage,
    setInfoOrder: setInfoOrder,
    handleSubEmail:handleSubEmail,
    handleTalkAgent: handleTalkAgent,
    handleTalkAgent2: handleTalkAgent2
};

