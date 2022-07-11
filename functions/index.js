const functions = require("firebase-functions");
const admin = require("firebase-admin");
require('dotenv').config();
admin.initializeApp();

const dbRef = admin.firestore().doc("tokens/3vB13jPdhRXDBk2QirB3");

const twitterApi = require("twitter-api-v2").default;
const twitterClient = new twitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const callbackURL = "http://127.0.0.1:3000/twbot-9026d/us-central1/callback";

// step 1
exports.auth = functions.https.onRequest(async (request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"] }
  );

  // store verifier
  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

// step 2
exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send("Stored tokens do not match!");
  }
  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

  await dbRef.set({ accessToken, refreshToken });

  const { data } = await loggedClient.v2.me(); // start using the client if you want

  response.send(data);
});

// step 3
exports.tweet = functions.https.onRequest(async (request, response) => {
  try {
    const { refreshToken } = (await dbRef.get()).data();


    const {
      client: refreshedClient,
      accessToken,
      refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);

    await dbRef.set({ accessToken, refreshToken: newRefreshToken });

    const nextTweet = await openai.createCompletion({
        model: "text-davinci-002",
      prompt: "tweet something cool for #techtwitter",
      max_tokens: 64,
      temperature: 0.6,
    });
    console.log({nextTweet});


    const { data } = await refreshedClient.v2.tweet(
      nextTweet.data.choices[0].text
    );

    response.send(data);
  } catch (error) {
    // console.log(error);
    response.status(500).send(error);
  }
});
