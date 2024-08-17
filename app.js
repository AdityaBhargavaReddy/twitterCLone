const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initilizeDBAndStart = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DataBase Error : '${error}'`);
  }
};
initilizeDBAndStart();

// Is User Following

const isUserFollowing = async (request, response, next) => {
  const { tweetId } = request.params;
  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);
  const followingUsersQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${dbResponse.user_id}';`;
  const followingUsers = await db.all(followingUsersQuery);
  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id='${tweetId}';`;
  const tweet = await db.get(tweetQuery);

  let isValidTweet = false;
  followingUsers.forEach((each) => {
    if (each.following_user_id === tweet.user_id) {
      isValidTweet = true;
    }
  });

  if (isValidTweet) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// Authentication with JWT Token

const authentication = (request, response, next) => {
  let Token = null;
  const authenticationHeader = request.headers["authorization"];
  if (authenticationHeader !== undefined) {
    Token = authenticationHeader.split(" ")[1];
  }
  if (authenticationHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(Token, "SECRET_TOKEN", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payLoad = payLoad;
        next();
      }
    });
  }
};

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const isUserRegisterQuery = `SELECT * FROM user WHERE username='${username}';`;
  const isUserRegister = await db.get(isUserRegisterQuery);
  if (isUserRegister === undefined) {
    const resgisterUserQuery = `INSERT INTO user(name,username,password,gender)
      Values(
        '${name}',
        '${username}', 
        '${hashedPassword}', 
        '${gender}'
        )`;
    const dbResponse = await db.run(resgisterUserQuery);
    response.send("User created successfully");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserExisitsQuery = `SELECT * FROM user WHERE username='${username}';`;
  const isUserExisits = await db.get(isUserExisitsQuery);
  if (isUserExisits === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserExisits.password
    );
    if (isPasswordMatched === true) {
      const payLoad = {
        username: username,
      };
      const jwtToken = jwt.sign(payLoad, "SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);

  const getTweetsQuery = `SELECT 
  username,tweet,date_time as datetime
      FROM 
      follower 
      INNER JOIN tweet 
      ON follower.following_user_id = tweet.user_id 
      NATURAL JOIN user 
    WHERE 
      follower.follower_user_id = '${dbResponse.user_id}'
    ORDER BY 
      datetime DESC
    LIMIT 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// API 4
app.get("/user/following/", authentication, async (request, response) => {
  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);

  const getfollowingUsersQuery = `SELECT 
  name
  FROM follower INNER JOIN user ON follower.following_user_id=user.user_id WHERE follower.follower_user_id='${dbResponse.user_id}';`;
  const followingUsers = await db.all(getfollowingUsersQuery);
  response.send(followingUsers);
});

// API 5

app.get("/user/followers/", authentication, async (request, response) => {
  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);

  const getfollowerUsersQuery = `SELECT 
  name
  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id WHERE follower.following_user_id='${dbResponse.user_id}';`;
  const followingUsers = await db.all(getfollowerUsersQuery);
  response.send(followingUsers);
});

//API 6

app.get(
  "/tweets/:tweetId/",
  authentication,
  isUserFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const query = `SELECT tweet,count() as replies,date_time as dateTime FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.tweet_id='${tweetId}';`;
    const data = await db.get(query);

    const likesQuery = `SELECT count() as likes FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.tweet_id='${tweetId}';`;
    const likes = await db.get(likesQuery);
    data.likes = likes.likes;
    response.send(data);
  }
);

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  isUserFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const likedUsersQuery = `SELECT username FROM user NATURAL JOIN like WHERE tweet_id='${tweetId}';`;
    const likedUsers = await db.all(likedUsersQuery);
    const likedUsersArray = likedUsers.map((each) => each.username);
    response.send({"likes": likedUsersArray});
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  isUserFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const replyUsersQuery = `SELECT user.name,reply.reply FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id INNER JOIN user ON user.user_id=reply.user_id WHERE tweet.tweet_id='${tweetId}';`;
    const replies = await db.all(replyUsersQuery);
    response.send({ replies });
  }
);

// API 9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);

  const tweetLikesAnddatetimequery = `SELECT tweet,count() as likes,date_time as dateTime FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.user_id='${dbResponse.user_id}'
  GROUP BY tweet.tweet_id;`;
  const tweetLikesAnddatetime = await db.all(tweetLikesAnddatetimequery);

  const repliesQuery = `SELECT count() as replies FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.user_id='${dbResponse.user_id}'
  GROUP BY tweet.tweet_id;`;
  const replies = await db.all(repliesQuery);
  tweetLikesAnddatetime.forEach((each) => {
    for (let eachReply of replies) {
      if (each.tweet_id === eachReply.tweet_id) {
        each.replies = eachReply.replies;
      }
    }
  });
  response.send(tweetLikesAnddatetime);
});

// API 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const tweetPostQuery = `INSERT INTO tweet(tweet)
  Values(
      '${tweet}'
  );`;

  const tweetPost = await db.run(tweetPostQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;

  const { payLoad } = request;
  const { username } = payLoad;
  const userQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const dbResponse = await db.get(userQuery);

  const requestedTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id='${tweetId}';`;
  const requestedTweet = await db.get(requestedTweetQuery);

  if (dbResponse.user_id === requestedTweet.user_id) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id='${tweetId}';`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
