#pragma once
#include <httplib/httplib.h>
#include <nlohmann/json.hpp>

void explainPair(const httplib::Request& request, httplib::Response& response);
