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
    online_status ENUM('ONLINE','OFFLINE') DEFAULT 'OFFLINE',
    subscribed BOOLEAN DEFAULT false,
    subscription_expiry DATE
);

  CREATE TABLE IF NOT EXISTS request(
    sender_id INT,
    receiver_id INT,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    PRIMARY KEY (sender_id, receiver_id),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

 CREATE TABLE IF NOT EXISTS skip(
    user_id INT NOT NULL,
    skipped_user_id INT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skipped_user_id) REFERENCES users(id)
 );

 CREATE TABLE IF NOT EXISTS payment_history(
 id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 reason varchar(255) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id)
 )
`;

module.exports = setupQueries;
