// alexaScreenControl - github.com/djmango/alexaScreenControl

const Alexa = require('ask-sdk-core');
const levenshtein = require('fast-levenshtein');
const rp = require('request-promise');

const controlServerEndpoint = 'example'

var options = {
    auth: {
        username: 'example',
        password: 'example'
    },
    json: true
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {

        const speechText = 'You can ask me to list the slideshows or to play a slideshow. Which would you like to do?';
        return handlerInput.responseBuilder
            // .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const ShowSlideshowIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'ShowSlideshowIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const inputKeyword = slots['slideshow'].value;
        let screenName;
        let screenID
        if (slots['screen'].value) {
            screenName = slots['screen'].value;
            screenID = slots['screen'].resolutions.resolutionsPerAuthority[0].values[0].value.id;
        }
        else {
            screenName = 'back room'
            screenID = 3
        }
        

        // grab the list of source names
        options.method = 'GET'
        options.uri = controlServerEndpoint + '/content'
        let p = rp(options)
            .then(function (nameList) {
                console.log('nameList:', nameList);
                // decide which was spoken
                let keywordList = extractKeyWords(nameList)
                let winner = calculateLevenshteinWinner(inputKeyword, keywordList)
                let speechText = ('Now showing ' + nameList[winner.id] + ' on ' + screenName)

                // tell control server which was spoken
                options.method = 'POST'
                options.uri = controlServerEndpoint + '/content'
                options.body = {
                    'sourceName': nameList[winner.id],
                    'displayID': screenID // hardcoded for seperate skills
                }
                rp(options);
                console.log(speechText)
                return (handlerInput.responseBuilder)
                    .speak(speechText)
                    // .reprompt('')
                    .getResponse();


            })
            .catch(function (err) {
                console.log(err)
            });
        return p;
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speechText = 'You can ask me to list the slideshows or to play a slideshow! How can I help?';

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent' ||
                handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speechText = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = handlerInput.requestEnvelope.request.intent.name;
        const speechText = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speechText)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.message}`);
        const speechText = `Sorry, I couldn't understand what you said. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

//
// functions
//

// okay so what we want to do is use levenshtein distance to compare
// the distances of the slideshowKeyWords to the inputKeyWord
// so that we can find the closest match to what the user said
// to do this we want to first isolate the slideshowKeyWords
// for this, we must slice up the slideshowList
// e.g. slideshowList ['Acura Product Demo', 'Employee-Slideshow', 'Marketing_Strategy_Slideshow']
// to extract the key words (Acura, Employee, Marketing, Strategy), we must slice it up by spaces/underscores/dashes
// then we assign each word an id given its initial place in the list, so Acura would be 0, Marketing and Strategy would both be 2
// at this point our structure would look like this
// slideshowKeyWords [{id: 0, keywords: ['Acura']} ... ,{id: 2, keywords: ['Marketing', 'Strategy']}]
// this way we keep the ability to return a selection from the initial list

// okay so at this point we can begin the levenshtein distance algorithm
// what we want is to give each id a 'score'
// this score is calculated as the minimum levenshtein distance any keyword an id has (the lowest score wins)
// e.g. inputKeyWord: Market, the id 2 would win as its score would be the lowest when comparing Market to Marketing
// we can then return id 2 to the control server, as the slideshow we want to play

function extractKeyWords(nameList) {
    // nameList: ['Acura', 'Marketing Strategy']
    let keywordList = [];

    // iterate through our slideshow names and split them, assign a key to them, and push them into our new list
    for (let i in nameList) {
        let names = nameList[i].split(/[- _]+/); // e.g. ['Marketing', 'Strategy']
        let itemHolder = {
            id: i,
            keywords: names
        }
        keywordList.push(itemHolder)
    }

    return keywordList; // e.g. [{id: 0, keywords: ['Acura']} ... ,{id: 2, keywords: ['Marketing', 'Strategy']}]
}

function calculateLevenshteinWinner(inputKeyword, keywordList) {

    // iterate through each id
    let scoreHolder = []
    for (let i in keywordList) {

        // iterate through all the keywords in [i] id and calculate score
        keywordList[i].score = [] // store ALL the values in a list, choose the lowest after we calculate all the scores for [i]
        for (let k in keywordList[i].keywords) {
            keywordList[i].score.push(levenshtein.get(inputKeyword, keywordList[i].keywords[k], {
                useCollator: true // just in case, to account for language-caused edge cases
            }))
        }
        keywordList[i].score = Math.min(...keywordList[i].score)
        scoreHolder.push(keywordList[i].score)
    }

    // at this point, every id in keywordList has a calculated score
    // with this, we choose the winner

    // choose the winner by finding the min score, then finding the object with that min score
    let winner = keywordList.find(obj => {
        return obj.score === Math.min(...scoreHolder); // not sure why it needs the '...'
    })

    return winner;
}


// This handler acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        ShowSlideshowIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler) // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    .addErrorHandlers(
        ErrorHandler)
    .lambda();
