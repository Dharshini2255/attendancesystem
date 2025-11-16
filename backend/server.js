// ...existing code and models above...

// Inside your /admin/users handler, near the batch offline marking logic:
const offlineUserIds = [];
for (const u of users) {
  const hasRecentLogin = u.lastLoginAt && new Date(u.lastLoginAt) >= activeThreshold;
  const hasRecentPing = activeStudentIds.has(String(u._id));
  // If no recent activity and user was loggedIn
  if (!hasRecentLogin && !hasRecentPing && u.loggedIn) {
    inactiveUserIds.push(u._id);
    u.loggedIn = false;
    offlineUserIds.push(u._id);
  }
}

if (inactiveUserIds.length > 0) {
  await Student.updateMany(
    { _id: { $in: inactiveUserIds } },
    { $set: { loggedIn: false } }
  );

  // Create 'offline' notification for each just-offline user
  const offlineUsers = users.filter(u => offlineUserIds.includes(u._id));
  for (const u of offlineUsers) {
    // Avoid flooding: only if they weren't just marked again seconds ago
    await Notification.create({
      type: 'offline',
      studentId: u._id,
      studentName: u.name,
      regNo: u.regNo,
      message: `${u.name} (${u.regNo}) is now offline`,
      at: new Date()
    });
  }
}

// ...rest of existing logic remains unchanged...