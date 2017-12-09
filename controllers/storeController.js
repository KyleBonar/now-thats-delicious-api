const mongoose = require("mongoose");
const Store = mongoose.model("Store");
const slug = require("slugs"); //Hi there! How are you! --> hi-there-how-are-you
const multer = require("multer"); //helps uploading images/files
const jimp = require("jimp"); //helps with resizing photos
const uuid = require("uuid"); //generated unique identifiers

const multerOptions = {
  storage: multer.memoryStorage(),
  fileFilter(req, file, next) {
    const isPhoto = file.mimetype.startsWith("image/");
    if (isPhoto) {
      next(null, true);
    } else {
      next({ message: "That filetype is not allowed" }, false);
    }
  },
  dest: "uploads/"
};

exports.upload = multer(multerOptions).single("image");

exports.resize = async (req, res, next) => {
  //check if new file to resize
  if (!req.file) {
    next(); //go to next middleware
    return;
  }

  //get file extension and generate unique name
  const extension = req.file.mimetype.split("/")[1];
  req.body.photo = `${uuid.v4()}.${extension}`;

  //resize photo
  try {
    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);
    next();
  } catch (err) {
    next({ message: "Image was unable to be saved" }, false);
  }
};

//when using FormData, which is needed to upload image, all data gets turned into
//string so we need to reformat to match model
exports.stringToProperType = (req, res, next) => {
  if (!req.body.location) {
    req.body.location = {};
  }

  if (typeof req.body.coordinates === "string") {
    req.body.location.coordinates = req.body.coordinates.split(",");
    delete req.body.coordinates;
  }

  if (typeof req.body.address === "string") {
    req.body.location.address = req.body.address;
    delete req.body.address;
  }

  if (typeof req.body.tags === "string") {
    req.body.tags = req.body.tags.split(",");
  }

  next(); //next middleware
};

exports.addStore = async (req, res) => {
  try {
    req.body.author = req.body._id;
    req.body._id = undefined;
    const store = await new Store(req.body).save();

    //send back slug so we can link to it for user to rate
    const data = {
      isGood: true,
      msg: "Store successfully added!",
      slug: store.slug
    };
    res.send(data);
  } catch (err) {
    //TODO log error somewhere so can be referenced later

    const data = {
      isGood: false,
      msg: "There was an issue saving your store. Try again"
    };
    res.send(data);
  }
};

exports.getStoreBySlug = async (req, res) => {
  try {
    const store = await Store.findOne({ slug: req.params.slug }).populate(
      "author"
    );

    //split author off from store
    const { author } = store;
    store.author = undefined;

    //send store and only author name
    const data = { isGood: true, store, author: { name: author.name } };
    res.send(data);
  } catch (err) {
    res.send(err);
  }
};

exports.getStoreById = async (req, res) => {
  try {
    const store = await Store.findOne({ _id: req.body.storeID });

    //make sure user is actual "owner" of store
    if (!store.author.equals(req.body._id)) {
      const data = {
        isGood: false,
        msg: "You must be the owner to edit the store."
      };
      return res.send(data);
    }

    const data = {
      isGood: true,
      msg: "Successfully found your store.",
      store
    };
    //send store back for user to edit
    return res.send(data);
  } catch (err) {
    const data = {
      isGood: false,
      msg: "Something broke or your store was unable to be found, Try again."
    };
    return res.send(data);
  }
};

exports.editStore = async (req, res) => {
  try {
    //generate new slug
    req.body.slug = slug(req.body.name);

    //set location data to be point
    req.body.location.type = "Point";

    //set _id to be store's ID instead of person's ID
    //remove person's ID from req.body
    req.body._id = req.body.storeID;
    req.body.storeID = undefined;

    //find store by _id and update
    const store = await Store.findOneAndUpdate(
      { _id: req.body._id },
      req.body,
      {
        new: true, //return new store instead of old one -- we want updated data returned
        runValidators: true //force model to be sure required fields are still there
      }
    ).exec();

    //send store to grab name and slug and create flash message
    res.send(store);
  } catch (err) {
    //go into here if user didn't input name or some other model requirement wasn't met
    res.send(err);
  }
};

exports.getStores = async (req, res) => {
  try {
    const stores = await Store.find();

    if (!stores) {
      const data = { isGood: false, msg: "Unable to find any stores" };
      return res.send(data);
    }

    const data = { isGood: true, stores, msg: "Successfully found sotres" };
    return res.send(data);
  } catch (err) {
    const data = { isGood: false, msg: "Unable to find any stores" };
    res.send(data);
  }
};

//TODO: Filter/sanitize user input
exports.searchStores = async (req, res) => {
  try {
    //search index by query param and score by relevancy
    const stores = await Store.find(
      {
        $text: {
          $search: req.params.q
        }
      },
      {
        score: { $meta: "textScore" }
      }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(5);

    if (!stores || stores.length === 0) {
      const data = {
        isGood: false,
        msg: `Unable to find any stores!`
      };
      res.send(data);
    }

    const data = {
      isGood: true,
      msg: `Successfully found ${stores.length} stores!`,
      stores
    };
    return res.send(data);
  } catch (err) {
    return res.send(err);
  }
};

exports.getStoreByTag = async (req, res) => {
  try {
    //get tag from param
    const tag = req.params.tag.toLowerCase();
    //query to get all tags or regex for case insensitive specific ones
    const tagQuery = tag === "all" ? { $exists: true } : new RegExp(tag, "i");

    //dont do anything until both promises are returned
    const result = await Promise.all([
      Store.getTagsList(),
      Store.find({ tags: tagQuery })
    ]);

    //send fail message if either promises fail
    if (!result[0] || !result[1]) {
      const data = {
        isGood: false,
        msg: "Unable to find tag count or tag-specific stores."
      };
      return res.send(data);
    }

    const data = {
      isGood: true,
      tags: result[0],
      stores: result[1],
      msg: "Successfuly found tag count and tag-specific stores."
    };
    return res.send(data);
  } catch (err) {
    const data = {
      isGood: false,
      msg: "You goof'd it. Try again."
    };
    return res.send(data);
  }
};
