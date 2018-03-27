const mongoose = require("mongoose");
const Scheme = mongoose.Schema;
mongoose.Promise = global.Promise; //surpresses error (?)
const md5 = require("md5");
const validator = require("validator");
const mongodbErrorHandler = require("mongoose-mongodb-errors");
const passportLocalMongoose = require("passport-local-mongoose"); //takes care of salting pw

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      isAsync: true,
      validator: validator.isEmail,
      msg: "Invalid Email Address"
    },
    required: "Please supply an email address"
  },
  name: {
    type: String,
    required: "Please supply a name",
    trim: true
  },
  hearts: [
    {
      type: mongoose.Schema.ObjectId,
      ref: "Sauce"
    }
  ],
  resetPasswordToken: String,
  resetPasswordExpires: Date
});

//Tells .toObject() to also not include __v
// which is a mongoose housekeeping thing
userSchema.set("toObject", {
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

userSchema.plugin(passportLocalMongoose, { usernameField: "email" });
userSchema.plugin(mongodbErrorHandler); //change ugly errors to nice

module.exports = mongoose.model("User", userSchema);
