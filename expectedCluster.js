window.SERVICE_CLUSTER_MAP = {
  "JPI-A": 6,
  "IN1": 8,
  "KCI": 8,
  "CMI 3": 4,
  "CMI": 4,
  "CMI2": 3,
  "IA8": 4,
  "CIM": 6,
  "IA15": 6,
  "I15": 6,
  "IA4": 8,
  "PERTIWI": 6,
  "JKF": 8,
  "JTH": 6,
  "JPI-B": 5,
  "KIS": 6,
  "CIT": 4,
  "IA1": 8
};

window.getExpectedClusterForService = function(service) {
  if (!service) return null;
  return SERVICE_CLUSTER_MAP[String(service).trim().toUpperCase()] || null;
};
