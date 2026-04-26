const { mongoose } = require('./mongoose');

const NotifSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, default: 'info' },
  title:     { type: String, required: true },
  message:   { type: String, default: '' },
  deployId:  { type: String, default: null },
  botName:   { type: String, default: '' },
  read:      { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', NotifSchema);
