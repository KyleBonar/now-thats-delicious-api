const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("mongoose").model("User");
const promisify = require("es6-promisify");
const mail = require("../handlers/mail.js");

exports.login = (req, res) => {
  // generate the authenticate method and pass the req/res
  passport.authenticate("local", function(err, user, info) {
    if (err) {
      return res.status(401).send(err);
    }

    if (!user) {
      const data = { isGood: false, msg: "Invalid email or password" };
      return res.status(401).send(data);
    }

    //create a token and send back
    const payload = { sub: user._id };
    const token = jwt.sign(payload, process.env.SECRET);
    const data = { isGood: true, msg: "Successfully logged in.", token };
    return res.status(200).send(data);
  })(req, res);
};

exports.isLoggedIn = (req, res, next) => {
  if (!req.body.token) {
    const data = {
      isGood: false,
      msg: "You are not logged in or your token is invalid. Please try again."
    };
    return res.status(401).send(data);
  }

  // get token from post
  const token = req.body.token;

  // decode the token using a secret key-phrase
  return jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      const data = {
        isGood: false,
        msg: "You are not logged in or your token is invalid. Please try again."
      };
      return res.status(401).send(data);
    }

    const userId = decoded.sub;

    // check if a user exists
    return User.findById(userId, (userErr, user) => {
      //error or not user
      if (userErr || !user) {
        const data = {
          isGood: false,
          msg:
            "You are not logged in or your token is invalid. Please try again."
        };
        res.status(401).send(data);
      }

      //attach _id to body
      req.body._id = user._id;

      //user is legit
      return next();
    });
  });
};

exports.forgot = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    //if user not found we will send false positive object but actually send no email
    //doing this check early will also prevent server from having to use resouces to create new token
    if (!user) {
      const data = { isGood: true, msg: "An email has been sent to you." };
      return res.send(data);
    }

    //create a token string
    const payload = {
      sub: user._id
    };
    const token = jwt.sign(payload, process.env.SECRET);

    //assign token and current date in DB to check against later
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    //create URL and email to user email
    const resetURL = `http://localhost:8080/account/reset/${user.resetPasswordToken}`;
    await mail.send({
      user,
      subject: "Password reset",
      resetURL,
      filename: "password-reset"
    });

    //send legitmate data
    const data = { isGood: true, msg: "An email has been sent to you." };
    return res.send(data);
  } catch (err) {
    res.send(err);
  }
};

//called to verify if token is legit or not when user first lands on reset page
exports.validateResetToken = async (req, res) => {
  try {
    //find if user exists w/ matching token and within time limit of 1hr
    const user = await User.findOne({
      resetPasswordToken: req.body.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      const data = {
        isGood: false,
        msg: "Password reset token has expired or is incorrect."
      };
      res.send(data);
      return;
    }

    const data = { isGood: true, msg: "Please enter a new password." };
    res.send(data);
  } catch (err) {
    res.send(err);
  }
};

//checks if two submitted passwords are equal
exports.confirmPasswords = (req, res, next) => {
  if (req.body.password === req.body.confirmPassword) {
    next(); //keep going
    return;
  }

  //passwords didn't match
  const data = {
    isGood: false,
    msg: "Passwords did not match. Please try again."
  };
  return res.status(401).send(data);
};

//reset password
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.body.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      res.send({
        isGood: false,
        msg: "User was not found or token has expired."
      });
      return;
    }

    //save pw
    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);

    //remove token and token expiration from db
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    //log user in -- need to bind email to req.body first
    //can clean up req.body too since local passport only needs email and password
    req.body.email = user.email;
    req.body.confirmPassword = undefined;
    req.body.token = undefined;

    next();
    return;
  } catch (err) {
    res.send(err);
    return;
  }
};

exports.validateToken = (req, res) => {
  const data = { isGood: true, msg: "Found user." };
  return res.status(200).send(data);
};
