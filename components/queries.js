
const setupQueries = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    gender VARCHAR(50),
    bio VARCHAR(250),
    date_of_birth DATE,
    likes JSON,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    contact VARCHAR(50) UNIQUE NOT NULL,
    profile_pic_url VARCHAR(255),
    avatar_url VARCHAR(255),
    profile_images JSON,
    document_url VARCHAR(255),
    education VARCHAR(255),
    status ENUM('ACTIVE', 'NON_ACTIVE') DEFAULT 'ACTIVE',
    subscribed BOOLEAN DEFAULT false,
    subscription_expiry DATE
);
`;

module.exports = setupQueries;