#pragma once // Pragma once prevents multiple inclusions of the same header file
#include <string> // Include the string header for using std::string

//Data structure to represent an aircraft with its call sign, latitude, longitude, and altitude in feet
struct Aircraft {
    std::string callSign;// Call sign of the aircraft
    double latitudeDegrees{};// Latitude in degrees
    double longitudeDegrees{};// Longitude in degrees
    double altitudeFeet{};   // Altitude in feet

};
