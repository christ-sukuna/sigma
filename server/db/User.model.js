const { mongoose } = require('./mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  phone:        { type: String, default: '' },
  plan:         { type: String, default: 'free' },
  maxBots:      { type: Number, default: 1 },
  isAdmin:      { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now },
});

UserSchema.methods.checkPassword = function(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);
