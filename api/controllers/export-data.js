const db = require('../utility/db');
const { verifyAdmin } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'Export data',
  description: 'Dump all database tables as JSON. Admin only.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      // Auth: only admin can export all data
      const admin = await verifyAdmin(this.req);
      if (!admin) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Admin authentication required.' };
      }
      const Users = db.getModel('users');
      const Categories = db.getModel('categories');
      const Threads = db.getModel('threads');
      const Posts = db.getModel('posts');
      const Votes = db.getModel('votes');
      const Roles = db.getModel('roles');
      const Moderations = db.getModel('moderations');
      const Config = db.getModel('config');

      const data = {
        exportedAt: Date.now(),
        users: Users.findAll(),
        categories: Categories.findAll(),
        threads: Threads.findAll(),
        posts: Posts.findAll(),
        votes: Votes.findAll(),
        roles: Roles.findAll(),
        moderations: Moderations.findAll(),
        config: Config.findAll(),
      };

      return { success: true, data };
    } catch (err) {
      sails.log.error('[export-data]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
