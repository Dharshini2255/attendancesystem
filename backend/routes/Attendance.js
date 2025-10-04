router.post("/attendance/ping", async (req, res) => {
  try {
    const { uuid, latitude, longitude } = req.body;
    const user = await User.findOne({ uuid });
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();

    let matchedPeriod = null, slot = null, periodIndex = -1;
    for (let i = 0; i < periodTimings.length; i++) {
      slot = getCheckSlot(now, periodTimings[i]);
      if (slot) { matchedPeriod = periodTimings[i]; periodIndex = i + 1; break; }
    }

    if (!slot) return res.status(400).json({ error: "Not within attendance window" });

    const classroomLat = user.location.latitude;
    const classroomLon = user.location.longitude;
    const status = isWithinRadius(latitude, longitude, classroomLat, classroomLon)
      ? "Present" : "Absent";

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let attendance = await Attendance.findOne({ studentId: user._id, date: today, period: periodIndex });

    if (!attendance) {
      attendance = new Attendance({
        studentId: user._id,
        date: today,
        period: periodIndex,
        checks: {}
      });
    }

    attendance.checks[slot] = status;
    await attendance.save();

    res.json({ message: `✅ ${slot} check recorded as ${status}`, attendance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
