const cloudinary = require("./config/cloudinaryConfig");
require("dotenv").config();
const jwt = require("jsonwebtoken");

// Haversine formula to calculate distance between two points in KM
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180; // Convert degrees to radians
  const dLon = ((lon2 - lon1) * Math.PI) / 180; // Convert degrees to radians
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Helper function to upload files to Cloudinary
const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: folder }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      })
      .end(file.buffer);
  });
};

// Middleware for validating signup request
const validateSignup = (req, res, next) => {
  const {
    name,
    contact,
    gender,
    bio,
    dob,
    interests,
    latitude,
    longitude,
    education,
  } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ status: false, message: "Name is required", user: null });
  if (!contact)
    return res
      .status(400)
      .json({ status: false, message: "Contact is required", user: null });
  if (!gender)
    return res
      .status(400)
      .json({ status: false, message: "Gender is required", user: null });
  if (!bio)
    return res
      .status(400)
      .json({ status: false, message: "Bio is required", user: null });
  if (!dob)
    return res.status(400).json({
      status: false,
      message: "Date of Birth is required",
      user: null,
    });
  if (!interests)
    return res
      .status(400)
      .json({ status: false, message: "Interests are required", user: null });
  if (!latitude)
    return res
      .status(400)
      .json({ status: false, message: "Latitude is required", user: null });
  if (!longitude)
    return res
      .status(400)
      .json({ status: false, message: "Longitude is required", user: null });
  if (!education)
    return res
      .status(400)
      .json({ status: false, message: "Education is required", user: null });
  next();
};
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Extract the token part

  if (token == null) {
    return res
      .status(401)
      .json({ status: false, message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ status: false, message: "Invalid token" });
    }

    req.user = user;
    next();
  });
};

module.exports = authenticateToken;



module.exports = {
  calculateDistance,
  uploadToCloudinary,
  validateSignup,
  authenticateToken,
};
