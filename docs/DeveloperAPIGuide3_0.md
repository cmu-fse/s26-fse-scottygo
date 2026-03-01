# **BusTime [®] Developer API** **Version 3 Guide**

**Revision 3.30**
**December 19, 2025**


**300 Crossways Park Drive**
**Woodbury, New York 11797**

**(516)433-6100 Phone**

**(516)433-5088 Fax**
**[www.cleverdevices.com](http://www.cleverdevices.com/)**


©2025 Clever Devices Ltd. All rights reserved. Printed in the United States of America.

**THIS DOCUMENT CONTAINS INFORMATION WHICH IS PROPRIETARY TO CLEVER**
**DEVICES LTD. THE USE OR DISCLOSURE OF ANY MATERIAL CONTAINED HEREIN**
**WITHOUT THE WRITTEN CONSENT OF CLEVER DEVICES LTD. IS STRICTLY**
**PROHIBITED.**

Specifications are subject to change without notice or obligation.

No part of this publication may be reproduced or distributed without the express written
permission of Clever Devices Ltd.

Clever Devices Ltd.
300 Crossways Park Drive
Woodbury, NY, USA 11797
Phone – (516) 433-6100
Fax – (516) 433-5088
www.cleverdevices.com

BusTime [®] Developer API Guide
Revision 3.30: 12/19/2025 (8.6.0)


###### **Contents**

_**Contents .............................................................................................................................. i**_

**1** _**Overview ...................................................................................................................... 1**_


**1.1** **What is the BusTime** **[®]** **Developer API? .................................................................................1**


**1.2** **What data is available through the API? .............................................................................1**


**1.3** **Will my application break if changes are made to the API? ..................................................1**


**1.4** **How does the Developer API work? ....................................................................................1**


**1.5** **Is there a limit to the number of requests I can make to the Developer API? ........................2**


**1.6** **Is there support for different languages? ............................................................................2**


**1.7** **How are external and multiple data feeds handled? ............................................................2**


**1.8** **How are dynamic changes to schedule data handled? .........................................................3**

**2** _**Web Service .................................................................................................................. 4**_

**3** _**Reference ...................................................................................................................... 5**_


**3.1** **Common Parameters ..........................................................................................................6**


**3.2** **Time ..................................................................................................................................6**


**3.3** **Vehicles .............................................................................................................................9**


**3.4** **Routes ............................................................................................................................. 14**


**3.5** **Route Directions .............................................................................................................. 16**


**3.6** **Stops ............................................................................................................................... 18**


**3.7** **Patterns ........................................................................................................................... 22**


**3.8** **Predictions ....................................................................................................................... 25**


**3.9** **Service Bulletins ............................................................................................................... 32**


**3.10** **Locales ......................................................................................................................... 35**


**3.11** **Real-Time Passenger Information .................................................................................. 38**


**3.12** **Detours ........................................................................................................................ 40**


**3.13** **Enhanced Detours ......................................................................................................... 44**


**3.14** **Bus Bridges ................................................................................................................... 54**


**3.15** **Agencies ....................................................................................................................... 59**

**4** _**Version 3 Release Notes .............................................................................................. 61**_


**4.1** **Calling Version 3............................................................................................................... 61**


**4.2** **Inclusion of “rtpidatafeed” parameter in most calls .......................................................... 61**


**BusTime** **[®]** **Developer API Guide** **i**


**4.3** **Inclusion of “rtpidatafeed” element for multi-feed systems .............................................. 62**


**4.4** **Introduction of the Detours call ....................................................................................... 62**


**4.5** **Introduction of Disruption Management changes ............................................................. 62**


**4.6** **Standardization of the Route Directions call ..................................................................... 62**


**4.7** **Changes to Real Time Passenger Information call ............................................................. 62**


**4.8** **Miscellaneous Fixes ......................................................................................................... 62**

**5** _**Dynamic Action Types ................................................................................................. 64**_

**6** _**Error Descriptions ........................................................................................................ 65**_


**BusTime** **[®]** **Developer API Guide** **ii**


##### **1 Overview**

###### **1.1 What is the BusTime [®] Developer API?**

The BusTime [®] Developer API allows you to request and retrieve real-time data directly from
BusTime [®] . Registered third-party developers can make HTTP requests for data and receive
XML or JSON responses from the BusTime [®] web server.

###### **1.2 What data is available through the API?**

Data available through the API includes:

  - Vehicle locations

  - Route data (route lists, stop lists geo-positional route definitions, stop lists, etc.)

  - Prediction Data

  - Service Bulletins

###### **1.3 Will my application break if changes are made to the API?**

No. The versioning of the API allows time for developers to upgrade their applications to make
use of new API features. Note that occasionally new parameters may be added to an existing
request or its response. However, existing parameters will never be removed or stop accepting
previously legal values.

Continuing to work with a particular version of the API guarantees that an application will not
break. When a new version is released, it will offer new features and fixes that would break
compatibility if added to the previous version. Using this method allows developers to continue
using the same version in their current applications while working to make use of the new
features of the next version.

###### **1.4 How does the Developer API work?**

In order to use the API, you must sign in to your BusTime [®] account and request an API key
using the following steps.

  - Create an account on the website.

  - Sign into your account

  - Select “My Account” from the top menu.

  - Click on the “Developer API” link and fill out the form.

Only one key will be available per account. Once your request has been approved, an e-mail
will be sent to you, containing the API key.

After receiving the key, you will be able to make calls to the API, entering the key as part of
the data request.


**BusTime** **[®]** **Developer API Guide** **1**


**Error Descriptions**

###### **1.5 Is there a limit to the number of requests I can make to the** **_Developer API?_**

Yes. By default, one API key can make a maximum of 10,000 requests per day. If you believe
that you will require more than 10,000 daily requests, you must request that the cap on your
key be raised to handle the additional traffic.

###### **1.6 Is there support for different languages?**

Yes. A list of supported languages can be requested over the API, and each request can include
the language to be used.

###### **1.7 How are external and multiple data feeds handled?**

If BusTime [®] is set up to support multiple prediction feeds, the developer API can be used to
access to those feeds.

A list of supported feeds can be requested using the **`getrtpidatafeeds`** request. The name of
the desired datafeed can be included as **`rtpidatafeed`** in Vehicles, Routes, Route Directions,
Patterns, Stops, Predictions, and Service Bulletins requests. Note that some of these requests
**require** an **`rtpidatafeed`** parameter when working within a system with multiple configured
feeds (even if only one of those feeds is enabled). Other requests can be called without this
parameter and doing so will expand the query across all feeds. See the reference for each
specific call for information about how that call handles this parameter.

A system with multiple-configured feeds will also return an **`rtpidatafeed`** element in the
response of some calls. See the reference for each specific call for information about this
element.

A single-feed system will never show the **`rtpidatafeed`** element and will never require the
**`rtpidatafeed`** parameter, so developers making use of a single-feed system’s API do not have
to concern themselves with data feeds.


Sample request of all feeds:

```
http://localhost:8080/bustime/api/v3/getrtpidatafeeds?key=89dj2he89d8j3j3ksjhdue93j

```

Sample response:

```
<bustime-response>
<rtpidatafeed>
<name>bustime</name>
<source>Bus Tracker</source>
<displayname>TA</displayname>
<enabled>true</enabled>
<visible>true</visible>
</rtpidatafeed>
<rtpidatafeed>
<name>ac transit</name>
<source>NEXTBUS</source>
<displayname>actransit</displayname>
<enabled>true</enabled>
<visible>true</visible>
</rtpidatafeed>

```

**2** **BusTime** **[®]** **Developer API Guide**


```
</bustime-response>

```

Sample request using external feed:

```
http://localhost:8080/bustime/api/v3/getroutes?key=89dj2he89d8j3j3ksjhdue93j
&rtpidatafeed=ac%20transit

```

Sample response:

```
<bustime-response>
<route>
<rt>1</rt>
<rtnm>MONUMENT / CHURCH HILL</rtnm>
<rtclr>#000000</rtclr>
<rtdd>1</rtdd>
<rtpidatafeed>ac transit</rtpidatafeed>
</route>
<route>
<rt>2</rt>
<rtnm>MONUMENT / CHURCH HILL</rtnm>
<rtclr>#ff0000</rtclr>
<rtdd>2</rtdd>
<rtpidatafeed>ac transit</rtpidatafeed>
</route>
</bustime-response>

###### **1.8 How are dynamic changes to schedule data handled?**
```

Version 3 introduces some dynamic data which fundamentally changes the proper use of the
API. Dynamic changes can be split into two categories: Detours and Disruption Management.
Before these changes, it may have been sufficient for an application to request route data once
during startup. If the API user wants to support dynamic changes, it is likely that the client will
need to make repeated requests for route data such as stops and patterns.

Detours are temporary changes in pattern data. Detour patterns appear normally in the
**getpatterns** call but have a **dtrid** identifying the detour. These patterns also come with a **dtrpt**
array, which allows the application to show the _original_ pattern that is no longer in effect (as a
dashed line on a map, for example).

These new temporary patterns may add or remove stops from the original pattern that is being
detoured. Stops (retrieved via **getstops** ) which are affected by detours will have **dtradd** and/or
**dtrrem** elements containing the identifier of the detour.

Scheduled arrival times may also be affected by detours, but there is no means of detecting this
in **getpredictions** results. The client application should display the predictions normally even
for detours.

The client application should rely on the new **getdetours** call to retrieve detour metadata and
present this data to the end user when detour changes are encountered throughout the API.

Disruption Management is a suite of actions which can change the trip data of the schedule.
Some examples are canceling or expressing arrivals and canceling, shifting, or creating trips.
The API represents these changes in **getpredictions** using new elements for each prediction.
Most rider-facing applications only need to be concerned about the **dyn** element, which may
label a prediction as canceled or expressed (drop-off only).


**BusTime** **[®]** **Developer API Guide** **3**


**Error Descriptions**

##### **2 Web Service**

The BusTime [®] Developer API is a web service that uses HTTP/1.1 as its application protocol.
Each type of call or request that can be made to the API is represented by a unique URL.
Requests are made to the API using HTTP GET calls to the appropriate URL. Parameters are
encoded in the HTTP GET request by following the URL with a “?” and “argument=value”
pairs separated by “&”.

A response is returned as a well-formed XML document with a Content-Type of “text/xml”, or
as a JSON document with a Content-Type of “application/json”.

For example, to request the current system time through the developer API, a program or script
will make a HTTP/1.1 GET request to the following URL with parameters:

**http://[host:port]/bustime/api/v3/gettime?key=89dj2he89d8j3j3ksjhdue93j**

The **[host:port]** is the host and port on which the Developer API is servicing HTTP requests.
The port is not required if requests are being serviced on port 80.

The version of the API that is being accessed is built into the URL. In the above example, “ **v3** ”
represents version 3.0 of the API.

The “ **key** ” parameter represents the API key assigned to the developer making the request. All
requests to the API must be accompanied by a valid API key.

In Versions 2 and later, an optional “ **format** ” parameter can be included to specify the response
type. XML is the default response format, and is used as the default if the “ **format** ” parameter
is not included. JSON can be chosen by including “ **format=json** ”.

**This document’s reference only details information about Version 3.** For information about
other versions of the API, review that version’s document instead, as the request and response
formats of different versions may not be compatible with one another.


**4** **BusTime** **[®]** **Developer API Guide**


##### **3 Reference**

This section describes all possible requests that can be made to the BusTime [®] Developer API.
For every request, a complete set of possible arguments is specified, along with the response.
For XML responses, the schema is specified.

_**Definitions**_

  - **Delayed Vehicle**  - The state entered by a vehicle when it has been determined to be
stationary for more than a pre-defined time period.

  - **Direction**  - Common direction of travel of a route.

  - **Format**  - The document type of the response. Currently XML and JSON are
supported.

  - **Locale**  - A string that represents the language to be used for the request. A list of valid
locales can be retrieved using getlocalelist. They are in ISO form, such as “en”, which
would be English.

  - **Off-route Vehicle**  - State entered by a transit vehicle when it has strayed from its
scheduled pattern.

  - **Pattern**  - A unique sequence of geo-positional points (waypoints and stops) that
combine to form the path that a transit vehicle will repetitively travel. A route often has
more than one possible pattern.

  - **Route**  - One or more set of patterns that together form a single service.

  - **Service Bulletin**  - Text-based announcements affecting a set of one or more services
(route, stops, etc.).

  - **Stop**  - Location where a transit vehicle can pick-up or drop-off passengers. Predictions
are only generated at stops.

  - **Waypoint**  - A geo-positional point in a pattern used to define the travel path of a transit
vehicle.


**BusTime** **[®]** **Developer API Guide** **5**


**Error Descriptions**

###### **3.1 Common Parameters**

All request URLs have these parameters in common:






|Name|Supported<br>Versions|Required?|Example|Description|
|---|---|---|---|---|
|**version**|All|Yes|/v3/|The version of the API being used.<br>Legal values are v1, v2, and v3.|
|**locale**|All|No|locale=en|The language that the response should<br>be in. See the reference for “Locale” for<br>more details on how to use this field.|
|**format**|v2+|No|format=json|The format of the response. Legal values<br>are “xml” and “json”. XML is the<br>default if no format is requested.|


###### **3.2 Time**

**Base URL: http://[host:port]/bustime/api/v3/gettime**

**Parameters**







|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**unixTime**|boolean (optional)|If true, returns the number of milliseconds<br>that have elapsed since 00:00:00 Coordinated<br>Universal Time (UTC), Thursday, 1 January<br>1970.|


**Response:**
A well-formed XML or JSON document, containing the current system time, will be returned
as a response to **gettime** .

**Response Fields**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Contains a message if the<br>processing of the request resulted in an error.|
|**tm**|Child element of the root element containing the current system<br>date and time (local). Date and time are represented in the following<br>format: YYYYMMDD HH:MM:SS. Month is represented as two<br>digits where January is “01” and December is “12”. Time is<br>represented using a 24-hour clock.<br>If the param unixTime=true, returns the number of milliseconds that<br>have elapsed since 00:00:00 Coordinated Universal Time (UTC),<br>Thursday, 1 January 1970.|



**Remarks:**
Use the **gettime** request to retrieve the current system date and time. Since BusTime [®] is a time

**6** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**


dependent system, it is important to synchronize your application with BusTime’s system date
and time.

This call is unchanged from v1. A JSON response requires v2 or higher.


The time given in the schema below is the local time.

**XML Schema:**

```
<?xml version="1.0" encoding="utf-8" ?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="bustime-response" type=" bustime-response" />
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="tm" type="xs:string" minOccurs="0" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request:**
http://localhost:8080/bustime/api/v3/gettime?key=89dj2he89d8j3j3ksjhdue93j


**Response:**
```
<?xml version=”1.0”?>
<bustime-response>
    <tm>20160308 14:42:32</tm>
</bustime-response>

```

**Request:**

http://localhost:8080/bustime/api/v3/gettime?key=89dj2he89d8j3j3ksjhdue93j&format=json

**Response:**

```
{
    "bustime-response": {
         "tm": "20160308 14:51:54"
    }
}

```

**Request:**
http://localhost:8080/bustime/api/v3/gettime?key=Qskvu4Z5JDwGEVswqdAVkiA5B&unixTi
me=true


**BusTime** **[®]** **Developer API Guide** **7**


**Error Descriptions**


**Response:**
<?xml version="1.0"?>
<bustime-response>
<tm>1531859957528</tm>
</bustime-response>

**Request:**

[http://localhost:8080/bustime/api/v3/gettime?key=Qskvu4Z5JDwGEVswqdAVkiA5B&unixTi](http://localhost:8080/bustime/api/v3/gettime?key=Qskvu4Z5JDwGEVswqdAVkiA5B&unixTime=true&format=json)
[me=true&format=json](http://localhost:8080/bustime/api/v3/gettime?key=Qskvu4Z5JDwGEVswqdAVkiA5B&unixTime=true&format=json)


**Response:**


{
"bustime-response": {
"tm": "1531860021189"
}
}


**8** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

###### **3.3 Vehicles**

**Base URL: http://[host:port]/bustime/api/v3/getvehicles**

_**Parameters**_











|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**vid**|Comma-delimited list<br>of vehicle IDs (not<br>available with**rt**<br>parameter)|Set of one or more vehicle IDs whose<br>location should be returned. For example:<br>509,392,201,4367 will return information for<br>four vehicles (if available). A maximum of<br>10 identifiers can be specified.|
|**rt**|Comma-delimited list<br>of route designators<br>(not available with the<br>**vid** parameter)|A set of one or more route designators for<br>which matching vehicles should be returned.<br>For example:**X3,4,20** will return information<br>for all vehicles currently running on those<br>three routes (if available). A maximum of 10<br>identifiers can be specified.|
|**tmres**|string (optional)|Resolution of time stamps. Set to “s” to get<br>time resolution to the second. Set to “m” to<br>get time resolution to the minute. If omitted,<br>defaults to “m”.<br>Date and time is represented in the following<br>format:<br>If specified as “s”<br>YYYYMMDD HH:MM:SS<br>If specified as “m”<br>YYYYMMDD HH:MM<br>Month is represented as two digits where<br>January is equal to “01” and December is<br>equal to “12”. Time is represented using a<br>24-hour clock.|
|**rtpidatafeed**|(multi-feed only)<br>string (optional)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve vehicles for.<br>If not given, results will span across all feeds.|


**Response:**
A well-formed XML or JSON document will be returned as a response to **getvehicles** . The
response will include the most-recent status for each vehicle.


**BusTime** **[®]** **Developer API Guide** **9**


**Error Descriptions**


**Response Fields:**

























|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of<br>the request resulted in an error.|
|**vehicle**|Child element of the root element. Encapsulates all information<br>available for a single vehicle in the response.|
|**vid**|Child element of the**vehicle** element. Alphanumeric string<br>representing the vehicle ID (ie. bus number)|
|**rtpidatafeed**|(Multi-feed only) Child element of the**vehicle**element. The<br>name of the data feed that the vehicle was retrieved from.|
|**tmstmp**|Child element of the**vehicle** element. Date and local time of the<br>last positional update of the vehicle. Date and time is represented<br>in the following format: YYYYMMDD HH:MM. Month is<br>represented as two digits where January is equal to “01” and<br>December is equal to “12”. Time is represented using a 24-hour<br>clock.|
|**lat**|Child element of the**vehicle** element. Latitude position of the<br>vehicle in decimal degrees (WGS 84).|
|**lon**|Child element of the**vehicle** element. Longitude position of the<br>vehicle in decimal degrees (WGS 84).|
|**hdg**|Child element of the**vehicle** element. Heading of vehicle as a<br>360º value, where 0º is North, 90º is East, 180º is South and 270º<br>is West.|
|**pid**|Child element of the**vehicle** element. Pattern ID of trip currently<br>being executed.|
|**pdist**|Child element of the**vehicle** element. Linear distance in feet that<br>the vehicle has traveled into the pattern currently being executed.|
|**rt**|Child element of the**vehicle** element. Route that is currently<br>being executed by the vehicle (ex. “20”).|
|**rtdir**|Child element of the**vehicle** element. Direction of travel of the<br>route executed by the vehicle (ex. “East Bound”).|
|**des**|Child element of the**vehicle** element. Destination of the trip<br>being executed by the vehicle (ex. “Austin”).|
|**dly**|Child element of the**vehicle** element. The value is “true” if the<br>vehicle is delayed. The**dly** element is only present if the vehicle<br>is delayed. (Not set by CAD dynamic action “unknown delay”)|
|**spd**|Child element of the**vehicle** element. Speed as reported from the<br>vehicle expressed in miles per hour (MPH).|
|**tablockid**|Child element of the**vehicle** element. TA’s version of the<br>scheduled block identifier for the work currently being<br>performed by the vehicle.|
|**tatripid**|Child element of the**vehicle** element. TA’s version of the<br>scheduled trip identifier for the vehicle’s current trip.|
|**origtatripno**|Child element of the**vehicle** element. Trip ID defined by the TA|


**10** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**







|Col1|scheduling system.|
|---|---|
|**zone**|Child element of the**prd** element. The zone name if the vehicle<br>has entered a defined zone, otherwise blank.|
|**mode**|Child element of the**vehicle** element. Mode of transportation for<br>the vehicle as a byte with range 0-4. 0 is None, 1 is Bus, 2 is<br>Ferry, 3 is Rail, and 4 is People_Mover.|
|**psgld**|Child element of the**vehicle** element. String representing the<br>ratio of the current passenger count to the vehicle’s total<br>capacity. Possible values include “FULL”, "HALF_EMPTY",<br>"EMPTY” and "N/A". Ratios for “FULL”, "HALF_EMPTY"<br>and "EMPTY” are determined by the transit agency. “N/A”<br>indicates that the passenger load is unknown.|
|**timepointid**|Child element of the**vehicle** element. Contains the timepoint id<br>for the current stop for this vehicle. Only included if the TA<br>supports GTFS stop status in BusTime.|
|**sequence**|Child element of the**vehicle** element. Contains the sequence<br>number of the current stop for this vehicle. Only included if the<br>TA supports GTFS stop status in BusTime.|
|**stopstatus**|Child element of the**vehicle** element. Integer representing the<br>current stop status of this vehicle per GTFS Realtime’s<br>VehicleStopStatus: STOPPED_AT (0), INCOMING_AT (1),<br>IN_TRANSIT_TO (2). Only included if the TA supports GTFS<br>stop status in BusTime.|
|**stopid**|Child element of the**vehicle** element. Contains the stop id for the<br>current stop for this vehicle. Only included if the TA supports<br>GTFS stop status in BusTime.|
|**gtfsseq**|Child element of the**vehicle** element. Contains the GTFS stop<br>sequence for the current stop for this vehicle. Only included if<br>the TA supports GTFS stop status in BusTime and if the<br>BusTime property “developer.api.include.gtfsseq” is true.|
|**stst**|Child element of the**vehicle**element. Contains the scheduled<br>start time (in seconds past midnight) of the trip that the vehicle is<br>running on.|
|**stsd**|Child element of the**vehicle**element. Contains the scheduled<br>start date (in “yyyy-mm-dd” format) of the trip that the vehicle is<br>running on.|


**Remarks:**
Use the **getvehicles** request to retrieve vehicle information (i.e., locations) of all or a subset of
vehicles currently being tracked by BusTime.

Use the **vid** parameter to retrieve information for one or more vehicles currently being tracked.

Use the **rt** parameter to retrieve information for vehicles currently running one or more of the
specified routes.


**BusTime** **[®]** **Developer API Guide** **11**


**Error Descriptions**


**Note:** The **vid** and **rt** parameters cannot be combined in one request. If both parameters
are specified on a request to **getvehicles,** only the first parameter specified on the
request will be processed.

**Note:** Data feeds with a source of “NEXTBUS” do not support this call. Feeds with the
“SYNCROMATICS” source are configurable to support this call with the property
‘rtpi.syncromatics.getvehicles.enabled’ which by default is disabled.


**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="vehicle" type="vehicle" minOccurs="0"
             maxOccurs="unbounded"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="vid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="vehicle">
         <xs:sequence>
             <xs:element name="vid" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="tmpstmp" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="lat" type="xs:double" minOccurs="1" maxOccurs="1"/>
             <xs:element name="lon" type="xs:double" minOccurs="1" maxOccurs="1"/>
             <xs:element name="hdg" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="pid" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtdir" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="des" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="pdist" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="stopstatus" type="xs:byte" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="timepointid" type="xs:int" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="stopid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="sequence" type="xs:int" minOccurs="0" maxOccurs="1"/>
             <xs:element name="gtfsseq" type="xs:int" minOccurs="0" maxOccurs="1"/>
             <xs:element name="dly" type="xs:boolean" minOccurs="1" maxOccurs="1"/>
             <xs:element name="srvtmstmp" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="spd" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="blk" type="xs:int" minOccurs="0" maxOccurs="1"/>
             <xs:element name="tablockid" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="tatripid" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="origtatripno" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="zone" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="mode" type="xs:byte" minOccurs="1" maxOccurs="1"/>
             <xs:element name="psgld" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="stst" type="xs:int" minOccurs="0" maxOccurs="1"/>

```

**12** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
             <xs:element name="stsd" type="xs:string" minOccurs="0" maxOccurs="1"/>
         </xs:sequence>

```

**Example:**
The XML document below is a response to the following request:

**Request:**
http://localhost:8080/bustime/api/v3/getvehicles?key=89dj2he89d8j3j3ksjhdue93j&vid=509,392

**Response:**

```
<?xml version="1.0"?>
<bustime-response>
    <vehicle>
         <vid>509</vid>
         <tmstmp>20200308 10:28</tmstmp>
         <lat>41.92124938964844</lat>
         <lon>-87.64849853515625</lon>
         <hdg>358</hdg>
         <pid>3630</pid>
         <pdist>5678</pdist>
         <rt>8</rt>
         <rtdir>EAST</rtdir>
         <des>Waveland/Broadway</des>
         <spd>27</spd>
         <tablockid>2 -701</tablockid>
         <tatripid>108</tatripid>
         <origtatripno>ME_ME403_V1_AA</origtatripno>
         <zone>Bay 1</zone>
         <mode>1</mode>
         <psgld>EMPTY</psgld>
         <stst>37560</stst>
         <stsd>2020-03-08</stsd>
    </vehicle>
    <vehicle>
         <vid>392</vid>
         <tmstmp>20200308 10:28</tmstmp>
         <lat>41.91095733642578</lat>
         <lon-87.64120713719782</lon>
         <hdg>88</hdg>
         <pid>1519</pid>
         <pdist>11203</pdist>
         <rt>72</rt>
         <rtdir>SOUTH</rtdir>
         <des>Clark</des>
         <spd>36</spd>
         <tablockid>3 -703</tablockid>
         <tatripid>108156</tatripid>
         <origtatripno>ME_ME403_V1_AA</origtatripno>
         <zone>Bay 1</zone>
         <mode>1</mode>
         <psgld>FULL</psgld>
         <stst>36900</stst>
         <stsd>2020-03-08</stsd>

    </vehicle>
</bustime-response>

```

**Example:**
The JSON document below is a response to the following request in a multi-feed system:

**Request:**
http://localhost:8080/bustime/api/v3/getvehicles?key=89dj2he89d8j3j3ksjhdue93j&vid=6438,1295&tm
res=s&rtpidatafeed=bustime&format=json


**BusTime** **[®]** **Developer API Guide** **13**


**Error Descriptions**


**Response:**

```
{
    "bustime-response": {
         "vehicle": [
             {
                 "vid": "1",
                 "rtpidatafeed": "bustime",
                 "tmstmp": "20200307 13:14",
                 "lat": "37.54381",
                 "lon": "-77.43878166666667",
                 "hdg": "308",
                 "pid": 1689,
                 "rt": "6",
                 "rtdir": "EAST",
                 "des": "BROAD WILLOW LAWN",
                 "pdist": 3481,
                 "dly": false,
                 "spd": 3,
                 "tatripid": "12",
                 "tablockid": "6-05",
                 "origtatripno": "ME_ME403_V1_AA",
                 "zone": "",
                 "mode": 1,
                 "psgld": "EMPTY",
                 "stst": 47520,
                 "stsd": "2020-03-07"
             },
             {
                 "vid": "2",
                 "rtpidatafeed": "bustime",
                 "tmstmp": "20200307 13:14",
                 "lat": "37.55896532837857",
                 "lon": "-77.48567781754004",
                 "hdg": "294",
                 "pid": 1559,
                 "rt": "16",
                 "rtdir": "SOUTH",
                 "des": "GROVE BF",
                 "pdist": 20156,
                 "dly": false,
                 "spd": 5,
                 "tatripid": "12",
                 "tablockid": "16-02",
                 "origtatripno": "ME_ME403_V1_AA",
                 "zone": "",
                 "mode": 1,
                 "psgld": "FULL",
                 "stst": 46140,
                 "stsd": "2020-03-07"

             }
         ]
    }
}

###### **3.4 Routes**
```

**Base URL: http://[host:port]/bustime/api/v3/getroutes**

**Parameters**






|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rtpidatafeed**|(multi-feed only)<br>string (optional)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve routes for. If<br>not given, results will span across all feeds.|



**14** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**


**Response:**
A well-formed XML or JSON document will be returned as a response to **getroutes** .

**Response Fields** :

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**route** <br>JSON Array:** routes**|Child element of the root element. Encapsulates a route serviced<br>by the system.|
|**rt**|Child element of the**route** element. Alphanumeric designator of a<br>route (ex. “20” or “X20”).|
|**rtnm**|Child element of the**route** element. Common name of the route<br>(ex. “Madison” for the 20 route).|
|**rtclr**|Child element of the**route** element. Color of the route line used in<br>map (ex. "#ffffff")|
|**rtdd**|Child element of the**route** element. Language-specific route<br>designator meant for display.|
|**rtpidatafeed**|(Multi-feed only) Child element of the**route** element. The name of<br>the data feed that the route was retrieved from.|



**Remarks:**
Use the **getroutes** request to retrieve the set of routes serviced by the system.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
     <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="route" type="route" minOccurs="0"
             maxOccurs="unbounded"/>
         </xs:sequence>
     </xs:complexType>
     <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
     </xs:complexType>
     <xs:complexType name="route">
         <xs:sequence>
             <xs:element name="rt" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtnm" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtclr" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtdd" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
         </xs:sequence>
     </xs:complexType>
</xs:schema>

```

**BusTime** **[®]** **Developer API Guide** **15**


**Error Descriptions**


**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getroutes?key=89dj2he89d8j3j3ksjhdue93j

**Response**

```
<?xml version=”1.0”?>
<bustime-response>
    <route>
         <rt>1</rt>
         <rtnm>Indiana/Hyde Park</rtnm>
         <rtclr>#000000</rtclr>
         <rtdd>1</rtdd>
    </route>
    <route>
         <rt>2</rt>
         <rtnm>Hyde Park Express</rtnm>
         <rtclr>#dc78af</rtclr>
         <rtdd>2</rtdd>
    </route>
    <route>
         <rt>3</rt>
         <rtnm>King Drive</rtnm>
         <rtclr>#ff0000</rtclr>
         <rtdd>3</rtdd>
    </route>
    <route>
         <rt>X3</rt>
         <rtnm>King Drive Express</rtnm>
         <rtclr>#ffffff</rtclr>
         <rtdd>X3</rtdd>
    </route>
    ...
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getroutes?key=89dj2he89d8j3j3ksjhdue93j&rtpidatafeed=
ExternalFeedName&format=json

**Response**
```
{
    "bustime-response": {
         "routes": [
             {
                 "rt": "1",
                 "rtnm": "Pontiac – Dhu Varren
                 "rtdd": "1",
                  "rtclr": "#ffffff"
                 "rtpidatafeed": "ExternalFeedName"
             },
             {
                 "rt": "2",
                 "rtnm": "Pontiac - University",
                 "rtdd": "1",
                 "rtclr": "#dc78af"
                 "rtpidatafeed": "ExternalFeedName"
             },
             ...
```

]
```
    }
}

###### **3.5 Route Directions**
```

**Base URL:** **http://[host:port]/bustime/api/v3/getdirections**


**16** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**


_**Parameters**_







|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rt**|single route designator<br>(required)|Alphanumeric designator of a route (ex. “20”<br>or “X20”) for which a list of available<br>directions is to be returned.|
|**rtpidatafeed**|(multi-feed only)<br>string (required)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve route<br>directions for.|


**Response:**
A well-formed XML or JSON document will be returned as a response to **getdirections** .

**Response Fields:**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**dir** <br>Json Array:<br>**directions**|Child element of the root element. Encapsulates a route’s direction<br>serviced by the system.|
|**id**|Child element of the** dir** element. This is the direction designator<br>that should be used in other requests such as getpredictions.|
|**name**|Child element of the**dir** element. This is the human-readable,<br>locale-dependent name of the direction.|
|**gtfsid**|Child element of the**dir** element. The identifier (0 or 1) of the<br>direction in the schedule’s GTFS static schedule files, if available.|



**Remarks:**
Use the **getdirections** request to retrieve the set of directions serviced by the specified route.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="dir" type="dir" minOccurs="0" maxOccurs="unbounded"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="dir">
         <xs:sequence>
             <xs:element name="id" type="xs:string" minOccurs="1" maxOccurs="1"/>

```

**BusTime** **[®]** **Developer API Guide** **17**


**Error Descriptions**

```
             <xs:element name="name" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="gtfsid" type="xs:string" minOccurs="0" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**


http://localhost:8080/bustime/api/v3/getdirections?key=89dj2he89d8j3j3ksjhdue93j&rt=20&rtpidatafeed=acmeta

**Response**

```
<?xml version=”1.0”?>
<bustime-response>
    <dir>
         <id>FLEX_0_1</id>
         <name>West toward Town Square</title>
         <gtfsid>0</gtfsid>
    </dir>
    <dir>
         <id>FLEX_0_2</id>
         <name>East toward Downtown</title>
         <gtfsid>1</gtfsid>
    </dir>
</bustime-response>

```

**Request**


http://localhost:8080/bustime/api/v3/getdirections?key=89dj2he89d8j3j3ksjhdue93j&rt=20&format=json&rtpidatafeed=acmeta

**Response**

```
{
    "bustime-response": {
         "directions": [
             {
                  "id": "FLEX_0_1",
                  "name": "West toward Town Square"
                  "gtfsid": 0
             },
             {
                  "id": "FLEX_0_2",
                  "name": "East toward Downtown"
                  "gtfsid": 1
             }
         ]
    }
}

###### **3.6 Stops**
```

**Base URL:** **http://[host:port]/bustime/api/v3/getstops**

**Parameters:**






|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rt**|single route designator<br>(required if stpid is not|Alphanumeric designator of the route (ex.<br>“20” or “X20”) for which a list of available|



**18** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**











|Col1|provided)|stops is to be returned.|
|---|---|---|
|**dir**|single route direction<br>(required if stpid is not<br>provided)|Direction of the route (ex. “East Bound”) for<br>which a list of available stops is to be<br>returned.<br>This needs to match the direction’s id in the<br>**getdirections** call.|
|**stpid**|comma-delimited list<br>of stop ids (required if<br>rt and dir are not<br>provided)|Numeric ID number for a specific stop (ex.<br>"305") for which a single stop is to be<br>returned. Can send up to 10 stop parameters.|
|**rtpidatafeed**|(multi-feed only)<br>string (required)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve stops for.|


**Response:**
A well-formed XML or JSON document will be returned as a response to **getstops** .

**Response Fields:**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**stop** <br>JSON Array:**stops**|Child element of the root element. Encapsulates all descriptive<br>information about a particular stop.|
|**stpid**|Child element of the**stop** element. Unique identifier representing<br>this stop.|
|**stpnm**|Child element of the**stop** element. Display name of this stop (ex.<br>“Madison and Clark”)|
|**lat**|Child element of the**stop** element. Latitude position of the stop in<br>decimal degrees (WGS 84).|
|**lon**|Child element of the**stop** element. Longitude position of the stop in<br>decimal degrees (WGS 84).|
|**dtradd**|Child element of the**stop** element. A list of detour ids which add<br>(temporarily service) this stop.|
|**dtrrem**|Child element of the**stop** element. A list of detour ids which<br>remove (detour around) this stop.|
|**gtfsseq**|Child element of the**stop** element. Contains the GTFS stop<br>sequence of the stop. Only included if the BusTime property<br>“developer.api.include.gtfsseq” is true and route & direction are<br>supplied|
|**ada**|Child element of the**stop**element. Possible values are**_true_** or**_false_, **<br>true indicating that the stop is ADA Accessible. Only included if<br>supplied by the TA.|



**Remarks:**
Use the **getstops** request to retrieve the set of stops for the specified route and direction. A
request must provide either a **rt & dir** or up to 10 **stpid** s, but not both.


**BusTime** **[®]** **Developer API Guide** **19**


**Error Descriptions**


Stop lists are only available for a valid route/direction pair. In other words, a list of all stops
that service a particular route (regardless of direction) cannot be requested.

If a stop is affected by a detour, the detour’s ID will appear in **dtradd** (if it was added to the
pattern) or **dtrrem** (if it has been detoured around). The application can use the **getdetours** call
to show relevant information about the detour to the end user.

**XML Schema** :

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
<xs:complexType name="bustime-response">
<xs:sequence>
<xs:element name="error" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
<xs:element name="stop" type="stop" minOccurs="0" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>
<xs:complexType name="error">
<xs:sequence>
<xs:element name="rtpidatafeed" type="xs:string" minOccurs="0" maxOccurs="1"/>
<xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
<xs:element name="dir" type="xs:string" minOccurs="0" maxOccurs="1"/>
<xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
</xs:sequence>
</xs:complexType>
<xs:complexType name="stop">
<xs:sequence>
<xs:element name="stpid" type="xs:string" minOccurs="1" maxOccurs="1"/>
<xs:element name="stpnm" type="xs:string" minOccurs="1" maxOccurs="1"/>
<xs:element name="lat" type="xs:double" minOccurs="1" maxOccurs="1"/>
<xs:element name="lon" type="xs:double" minOccurs="1" maxOccurs="1"/>
<xs:element name="dtradd" type="xs:int" minOccurs="0" maxOccurs="unbounded"/>
<xs:element name="dtrrem" type="xs:int" minOccurs="0" maxOccurs="unbounded"/>
<xs:element name="gtfsseq" type="xs:int" minOccurs="0" maxOccurs="1"/>
<xs:element name="ada" type="xs:boolean" minOccurs="0" maxOccurs="1"/>
</xs:sequence>
</xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getstops?key=89dj2he89d8j3j3ksjhdue93j&rt=20&dir=East%20Bound


**Response**

```
<?xml version=”1.0”?>
<bustime-response>
    <stop>
         <stpid>4727</stpid>
         <stpnm>1633 W Madison</stpnm>
         <lat>41.881265</lat>
         <lon>-87.66849</lon>
    </stop>
    <stop>
         <stpid>100123</stpid>
         <stpnm>Temporary stop on Austin</stpnm>
         <lat>41.885206667</lat>
         <lon>-87.7748733333333</lon>
         <dtradd>0F0119D3-9E18-4B72-9532-CA00C3C68022</dtradd>
    </stop>
    <stop>
         <stpid>9605</stpid>

```

**20** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
         <stpnm>Austin & Randolph/West End</stpnm>
         <lon>41.8838633333333</lon>
         <lat>-87.7748566666667</lat>
    </stop>
    <stop>
         <stpid>9603</stpid>
         <stpnm>Austin & South Blvd/Corcoran</stpnm>
         <lat>41.886908333</lat>
         <lon>-87.77493667</lon>
    </stop>
    ...
</bustime-response>
```

**Request**
http://localhost:8080/bustime/api/v3/getstops?key=89dj2he89d8j3j3ksjhdue93j&rt=20&dir=East%20Bound&format=json

**Response**
```
{
    "bustime-response": {
         "stops": [
             {
                  "stpid": "1577",
                  "stpnm": "1509 S Michigan",
                  "lat": 41.861706666665,
                  "lon": -87.623969999999
             },
             {
                  "stpid": "1564",
                  "stpnm": "3000 S Michigan",
                  "lat": 41.840606666667,
                  "lon": -87.623206666667
"dtrrem": [
                            "BFC46F62-990F-4AB4-A85C-3AF84574EC99",
                            "50C633C7-0891-4E5A-83A8-FF0C6214BF69"
                       ]

             },
             ...
         ]
    }
}

```

**BusTime** **[®]** **Developer API Guide** **21**


**Error Descriptions**

###### **3.7 Patterns**

**Base URL: http://[host:port]/bustime/api/v3/getpatterns**

**Parameters:**









|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**pid**|comma-delimited list<br>of pattern IDs (not<br>available with**rt** <br>parameter)|Set of one or more pattern IDs whose points<br>should be returned. For example: 56,436,122<br>will return points from three (3) patterns. A<br>maximum of 10 identifiers can be specified.|
|**rt**|single route designator<br>(not available with**pid** <br>parameter)|Route designator for which all active patterns<br>should be returned.|
|**rtpidatafeed**|(multi-feed only)<br>string (required)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve patterns for.|


**Response:**



A well-formed XML or JSON document will be returned as a response to **getpatterns** .

**Response Fields:**







|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**ptr**|Child element of the root element. Encapsulates a set of points<br>which define a pattern.|
|**pid**|Child element of the**ptr** element. ID of pattern.|
|**ln**|Child element of the**ptr** element. Length of the pattern in feet.|
|**rtdir**|Child element of the**ptr** element. Direction that is valid for the<br>specified route designator. For example, “INBOUND”. This needs<br>to match the direction id seen in the getdirections call.|
|**pt**|Child element of the**ptr** element. Child element of the root<br>element. Encapsulates one a set of geo-positional points (including<br>stops) that when connected define a pattern.|
|**seq**|Child element of the**pt** element. Position of this point in the overall<br>sequence of points.|
|**typ**|Child element of the**pt** element. ‘S’ if the point represents a Stop,<br>‘W’ if the point represents a waypoint along the route.|
|**stpid**|Child element of the**pt** element. If the point represents a stop, the<br>unique identifier of the stop.|
|**stpnm**|Child element of the**pt** element. If the point represents a stop, the<br>display name of the stop.|
|**pdist**|Child element of the**pt** element. If the point represents a stop, the<br>linear distance of this point (feet) into the requested pattern.|


**22** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**







|lat|Child element of the pt element. Latitude position of the point in<br>decimal degrees (WGS 84).|
|---|---|
|**lon**|Child element of the**pt** element. Longitude position of the point in<br>decimal degrees (WGS 84).|
|**dtrid**|Child element of the**ptr** element. If this pattern was created by a<br>detour, contains the id of the detour. Does not appear for normal<br>patterns.|
|**dtrpt**|Child element of the**ptr** element. If this pattern was created by a<br>detour, encapsulates a set of geo-positional points that represent the<br>_original_ pattern. Useful for drawing dashed lines on a map.|


**Remarks:**

Use the **getpatterns** request to retrieve the set of geo-positional points and stops that when
connected can be used to construct the geo-positional layout of a pattern (i.e., route variation).

Use **pid** to specify one or more identifiers of patterns whose points are to be returned. A
maximum of 10 patterns can be specified.

Use **rt** to specify a route identifier where all active patterns are returned. The set of active
patterns returned includes: one or more patterns marked as “default” patterns for the specified
route and all patterns that are currently being executed by at least one vehicle on the specified
route.

**Note:** The **pid** and **rt** parameters cannot be combined in one request. If both parameters
are specified on a request to **getpatterns**, only the first parameter specified on the
request will be processed.


**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="bustime-response" type="bustime-response"/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="ptr” type="ptr" minOccurs="0" maxOccurs="10"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="pid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="ptr">
         <xs:element name="pid" type="xs:int" minOccurs="1" maxOccurs="1"/>
         <xs:element name="ln" type="xs:int" minOccurs="1" maxOccurs="1"/>
         <xs:element name="rtdir" type="xs:string" minOccurs="1" maxOccurs="1"/>
         <xs:element name="pt" type="pt" minOccurs="1" maxOccurs="unbounded"/>
         <xs:element name="dtrid" type="xs:string" minOccurs="0" maxOccurs="1"/>
         <xs:element name="dtrpt" type="pt" minOccurs="0" maxOccurs="unbounded"/>
    </xs:complexType>
    <xs:complexType name="pt">

```

**BusTime** **[®]** **Developer API Guide** **23**


**Error Descriptions**

```
         <xs:sequence>
             <xs:element name="seq" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="typ" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="stpid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stpnm" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="pdist" type="xs:float" minOccurs="0" maxOccurs="1"/>
             <xs:element name="lat" type="xs:double" minOccurs="1" maxOccurs="1"/>
             <xs:element name="lon" type="xs:double" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getpatterns?key=89dj2he89d8j3j3ksjhdue93j&rt=20&pid=954

**Response**

```
<?xml version=”1.0”?>
<bustime-response>
    <ptr>
         <pid>954</pid>
         <ln>35569</ln>
         <rtdir>INBOUND</rtdir>
         <pt>
             <seq>1</seq>
             <typ>S</typ>
             <stpid>409</stpid>
             <stpnm>Madison & Pulaski</stpnm>
             <lat>41.880641167057</lat>
             <lon>-87.725835442543</lon>
             <pdist>0.0</pdist>
         </pt>
         <pt>
             <seq>2</seq>
             <typ>W</typ>
             <lat>41.880693089146</lat>
             <lon>-87.725765705109</lon>
         </pt>
         <pt>
             <seq>3</seq>
             <typ>W</typ>
             <lat>41.880693089146</lat>
             <lon>-87.725674510002</lon>
             <pdist>97.0</pdist>
         </pt>
         ...
    </ptr>
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getpatterns?key=89dj2he89d8j3j3ksjhdue93j&rtpidatafeed
=bustime&rt=20&pid=954&format=json

**Response**
```
{
    "bustime-response": {
         "ptr": [
             {
                  "pid": 1146,
                  "ln": 42608.0,
                  "rtdir": "EAST",
                  "pt": [
                      {
                           "seq": 1,

```

**24** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
                           "lat": 37.537591575456,
                           "lon": -77.472311666667,
                           "typ": "S",
                           "stpid": "1697",
                           "stpnm": "Meadow + Colorado",
                           "pdist": 0.0
                      },
                      {
                           "seq": 2,
                           "lat": 37.536418242205,
                           "lon": -77.472629999998,
                           "typ": "S",
                           "stpid": "1699",
                           "stpnm": "Meadow + Dakota",
                           "pdist": 440.0
                      }
                  ]
             }
         ]
    }
}

###### **3.8 Predictions**
```

**Base URL: http://[host:port]/bustime/api/v3/getpredictions**

**Parameters:**









|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**stpid**|comma-delimited list<br>of stop IDs (not<br>available with**vid**<br>parameter)|Set of one or more stop IDs whose<br>predictions are to be returned. For example:<br>5029,1392,2019,4367 will return predictions<br>for the four stops. A maximum of 10<br>identifiers can be specified.|
|**rt**|comma-delimited list<br>of route designators<br>(optional, available<br>with**stpid** parameter)|Set of one or more route designators for<br>which matching predictions are to be<br>returned.|
|**vid**|comma-delimited list<br>of vehicle IDs (not<br>available with**stpid**<br>parameter)|Set of one or more vehicle IDs whose<br>predictions should be returned. For example:<br>509,392,201,4367 will return predictions for<br>four vehicles. A maximum of 10 identifiers<br>can be specified.|
|**top**|number (optional)|Maximum number of predictions to be<br>returned.|
|**tmres**|string(optional)|Resolution of time stamps. Set to “s” to get<br>time resolution to the second. Set to “m” to<br>get time resolution to the minute. If omitted,<br>defaults to “m”.<br>Date and time is represented in the following<br>format:<br>If specified as “s”<br>YYYYMMDD HH:MM:SS<br>If specified as “m”|


**BusTime** **[®]** **Developer API Guide** **25**


**Error Descriptions**





|Col1|Col2|YYYYMMDD HH:MM<br>Month is represented as two digits where<br>January is equal to “01” and December is<br>equal to “12”. Time is represented using a<br>24-hour clock.|
|---|---|---|
|**rtpidatafeed**|(multi-feed only)<br>string (required)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve predictions<br>for.|
|**unixTime**|boolean (optional)|**_True_** if timestamps should be provided as<br>Unix times (milliseconds that have elapsed<br>since 00:00:00 Coordinated Universal Time<br>(UTC), Thursday, 1 January 1970). Default is<br>**_false_**.|


**Response:**
A well-formed XML or JSON document will be returned as a response to **getpredictions** .

**Response Fields:**













|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**prd**|Child element of the root element. Encapsulates a predicted arrival<br>or departure time for the specified set of stops or vehicles.|
|**tmstmp**|Child element of the**prd** element. Date and time (local) the<br>prediction was generated. Date and time is represented based on the<br>**tmres** parameter if the**unixTime** parameter is omitted or set to<br>false. If the unixTime parameter is present and set to_true_, returns<br>the number of milliseconds that have elapsed since 00:00:00<br>Coordinated Universal Time (UTC), Thursday, 1 January 1970.|
|**typ**|Child element of the**prd** element. Type of prediction. ‘A’ for an<br>arrival prediction (prediction of when the vehicle will arrive at this<br>stop). ‘D’ for a departure prediction (prediction of when the vehicle<br>will depart this stop, if applicable). Predictions made for first stops<br>of a route or layovers are examples of departure predictions.|
|**stpid**|Child element of the**prd** element. Unique identifier representing<br>the stop for which this prediction was generated.|
|**stpnm**|Child element of the**prd** element. Display name of the stop for<br>which this prediction was generated.|
|**vid**|Child element of the**prd** element. Unique ID of the vehicle for<br>which this prediction was generated.|
|**dstp**|Child element of the**prd** element. Linear distance (feet) left to be<br>traveled by the vehicle before it reaches the stop associated with<br>this prediction.|
|**rt**|Child element of the**prd** element. Alphanumeric designator of the<br>route (ex. “20” or “X20”) for which this prediction was generated.|


**26** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**


















|rtdd|Child element of the prd element. Language-specific route<br>designator meant for display.|
|---|---|
|**rtdir**|Child element of the**prd** element. Direction of travel of the route<br>associated with this prediction (ex. “INBOUND”). This matches the<br>direction id seen in the getdirections call.|
|**des**|Child element of the**prd** element. Final destination of the vehicle<br>associated with this prediction.|
|**prdtm**|Child element of the**prd** element. Predicted date and time (local) of<br>a vehicle’s arrival or departure to the stop associated with this<br>prediction. Date and time is represented based on the**tmres** <br>parameter if the**unixTime** parameter is omitted or set to false. If<br>the unixTime parameter is present and set to_true_, returns the<br>number of milliseconds that have elapsed since 00:00:00<br>Coordinated Universal Time (UTC), Thursday, 1 January 1970.|
|**dly**|Child element of the**prd** element. “true” if the vehicle is delayed.<br>In version 3 this element is always present. This is not used by<br>RTPI feeds. (Not set by CAD dynamic action “unknown delay”)|
|**dyn**|Child element of the**prd** element. The dynamic action type<br>affecting this prediction. See the “Dynamic Action Types” section<br>for a list of possible identifiers.|
|**tablockid**|Child element of the**prd** element.  TA’s version of the scheduled<br>block identifier for the work currently being performed by the<br>vehicle.|
|**tatripid**|Child element of the**prd** element.  TA’s version of the scheduled<br>trip identifier for the vehicle’s current trip.|
|**origtatripno**|Child element of the**prd** element. Trip ID defined by the TA<br>scheduling system.|
|**prdctdn**|Child element of the**prd** element.  This is the time left, in minutes,<br>until the bus arrives at this stop.|
|**zone**|Child element of the**prd** element.  The zone name if the vehicle has<br>entered a defined zones, otherwise blank.<br>This is not used by RTPI feeds.|
|**nbus**|Child element of the**prd** element. If this prediction is the last<br>arrival (for this route) before a service gap, this represents the<br>number of minutes until the next scheduled bus arrival (from the<br>prediction time).|
|**psgld**|Child element of the**prd** element. String representing the ratio of<br>the current passenger count to the vehicle’s total capacity. Possible<br>values include “FULL”, "HALF_EMPTY", "EMPTY” and "N/A".<br>Ratios for “FULL”, "HALF_EMPTY" and "EMPTY” are<br>determined by the transit agency. “N/A” indicates that the<br>passenger load is unknown.|
|**gtfsseq**|Child element of the**prd** element. Contains the GTFS stop<br>sequence of the stop for which this prediction was generated. Only<br>included if the BusTime property “developer.api.include.gtfsseq” is<br>true.|



**BusTime** **[®]** **Developer API Guide** **27**


**Error Descriptions**

|stst|Child element of the prd element. Contains the time (in seconds<br>past midnight) of the scheduled start of the trip.|
|---|---|
|**stsd**|Child element of the**prd**element. Contains the date (in “yyyy-mm-<br>dd” format) of the scheduled start of the trip.|
|**flagstop**|Child element of the**prd**element. An integer code representing the<br>flag-stop information for the prediction.<br>-1 = UNDEFINED (no flag-stop information available)<br>0 = NORMAL (normal stop)<br>1 = PICKUP_AND_DISCHARGE (Flag stop for both pickup and<br>discharge)<br>2 = ONLY_DISCHARGE (Flag stop for discharge only)|



**Remarks:**

Use the **getpredictions** request to retrieve predictions for one or more stops or one or more
vehicles. Predictions are always returned in ascending order according to **prdtm** .

Use the **vid** parameter to retrieve predictions for one or more vehicles currently being tracked.
A maximum of 10 vehicles can be specified.

Use the **stpid** parameter to retrieve predictions for one or more stops. A maximum of 10 stops
can be specified.

**Note:** The **vid** and **stpid** parameters cannot be combined in one request. If both
parameters are specified on a request to **getpredictions,** only the first parameter
specified on the request will be processed.

Calls to **getpredictions** without specifying the **vid** or **stpid** parameters are not allowed.

Use the **top** parameter to specify the maximum number of predictions to return. If **top** is not
specified, then all predictions matching the specified parameters will be returned.

**nBus** only appears if the Transit Authority has the service gap feature enabled. If **nBus** would
have a value less than the configured minimum gap of time (default 120 minutes), the element
is empty. If **nBus** is “-1”, then this prediction is the last bus of the day for this route.

If canceled stops are not configured to be displayed to the public, predictions for them will not
be included in the **getpredictions** response. If expressed stops are not configured to not be
displayed to the public, predictions for them will not be included in the **getpredictions**
response.


**XML Schema**
```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="bustime-response" type="bustime-response"/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>

```

**28** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
             <xs:element name="prd" type="prediction" minOccurs="0"
             maxOccurs="unbounded"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="stpid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="vid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="prediction">
         <xs:all>
             <xs:element name="tmstmp" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="typ" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="stpid" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="stpnm" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="vid" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="dstp" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtdd" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtdir" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="des" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="prdtm" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="dly" type="xs:boolean" minOccurs="0" maxOccurs="1"/>
             <xs:element name="dyn" type="xs:byte" minOccurs="1" maxOccurs="1"/>
             <xs:element name="tablockid" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="tatripid" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="origtatripno" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="zone" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="psgld" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="gtfsseq" type="xs:int" minOccurs="1" maxOccurs="1"/>
             <xs:element name="nbus" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stst" type="xs:int" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stsd" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="flagstop" type="xs:int" minOccurs="1" maxOccurs="1"/>
         </xs:all>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getpredictions?key=89dj2he89d8j3j3ksjhdue93j&rt=20&stpid=456

**Response**
```
<?xml version=”1.0”?>
<bustime-response>
    <tm></tm>
    <prd>
         <tmstmp>20200611 14:34</tmstmp>
         <typ>A</typ>
         <stpid>456</stpid>
         <stpnm>Madison & Jefferson</stpnm>
         <vid>2013</vid>
         <dstp>891</dstp>
         <rt>20</rt>
         <rtdd>20</rtdd>
         <rtdir>West Bound</rtdir>
         <des>Austin</des>
         <prdtm>20200611 14:40</prdtm>
         <tablockid>3 -701</tablockid>
         <tatripid>106</tatripid>

```

**BusTime** **[®]** **Developer API Guide** **29**


**Error Descriptions**

```
         <origtatripno>ME_ME403_V1_AA</origtatripno>
         <zone></zone>
         <psgld>HALF_EMPTY</psgld>
         <gtfsseq>15</gtfsseq>
         <stst>52200</stst>
         <stsd>2020-06-11</stsd>
         <flagstop>0</flagstop>
    </prd>
    <prd>
         <tmstmp>20200611 14:34</tmstmp>
         <typ>A</typ>
         <stpid>456</stpid>
         <stpnm>Madison & Jefferson</stpnm>
         <vid>6435</vid>
         <dstp>1587</dstp>
         <rt>20</rt>
         <rtdd>20</rtdd>
         <rtdir>West Bound</rtdir>
         <des>Austin</des>
         <prdtm>20200611 14:48</prdtm>
         <tablockid>3 -706</tablockid>
         <tatripid>108</tatripid>
         <origtatripno>ME_ME403_V1_AA</origtatripno>
         <zone>Bay 1</zone>
         <psgld>HALF_EMPTY</psgld>
         <gtfsseq>20</gtfsseq>
         <stst>52200</stst>
         <stsd>2020-06-11</stsd>
         <flagstop>2</flagstop>
    </prd>
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getpredictions?key=89dj2he89d8j3j3ksjhdue93j&rt=20&stpid=456
&format=json

**Response**

```
{
    "bustime-response": {
         "prd": [
             {
                  "tmstmp": "20200104 15:00",
                  "typ": "A",
                  "stpnm": "87th Street \u0026 Wentworth",
                  "stpid": "9405",
                  "vid": "",
                  "dstp": 0,
                  "rt": "87",
                  "rtdd": "87",
                  "rtdir": "INBOUND",
                  "des": "91st/Commercial",
                  "prdtm": "20200104 15:08",
                  "tablockid": "87 -706",
                  "tatripid": "1007569",
                  "origtatripno": "ME_ME403_V1_AA",
                  "dly": false,
                  "prdctdn": "8",
                  "zone": ""
                  "psgld": "N/A",
                  "gtfsseq": 15,
                  "stst": 53100,
                  "stsd": "2020-01-04",
                  "flagstop": 2

             },
             ...
         ]
    }

```

**30** **BusTime** **[®]** **Developer API Guide**


```
}

```


**Error Descriptions**


**BusTime** **[®]** **Developer API Guide** **31**


**Error Descriptions**

###### **3.9 Service Bulletins**

**Base URL: http://[host:port]/bustime/api/v3/getservicebulletins**

**Parameters:**















|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rt**|comma-delimited list<br>of route designators<br>(required if**stpid** not<br>specified)|Alphanumeric designator of the route(s) (ex.<br>“20” or “X20”) for which a list of service<br>bulletins is to be returned. If combined with<br>**rtdir**, only one route can be specified.|
|**rtdir**|single route direction<br>(optional)|Direction of travel of the route specified in<br>the**rt** parameter. The**rt** parameter is required<br>when using the**rtdir** parameter. This needs<br>to match the direction id seen in the<br>getdirections call.|
|**stpid**|comma-delimited list<br>of stop IDs (required if<br>**rt** not specified)|Set of one or more stop IDs for which service<br>bulletins are to be returned. For example:<br>5029,1392,2019,4367 will return predictions<br>for the four stops (if available). If combined<br>with**rt** and**rtdir**, only one stop can be<br>specified.|
|**rtpidatafeed**|(multi-feed only)<br>string (required)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve service<br>bulletins for.|


**Response:**

A well-formed XML or JSON document will be returned as a response to **getservicebulletins** .

**Response Fields:**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**sb**|Child element of the root element. Encapsulates all data about a<br>service bulletin.|
|**nm**|Child element of the**sb** element. Unique name/identifier of the<br>service bulletin.|
|**sbj**|Child element of the**sb** element. Service bulletin subject. A short<br>title for this service bulletin.|
|**dtl**|Child element of the**sb** element. Service bulletin detail. Full text of<br>the service bulletin.|
|**brf**|Child element of the**sb** element. Service bulletin brief. A short text<br>alternative to the service bulletin detail.|
|**cse**|Child element of the**sb** element. Cause for service bulletin.|
|**efct**|Child element of the**sb** element. Effect for service bulletin.|



**32** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**













|prty|Child element of the sb element. Service bulletin priority. The<br>possible values are "High," "Medium," and "Low".|
|---|---|
|**Name**|**Description**|
|**rtpidatafeed**|(multi-feed only) Child element of the**sb** element. The name of the<br>data feed that the service bulletin affects. If the**rtpidatafeed** <br>element is empty, the service bulletin affects the entire system.|
|**srvc**|Child element of the**sb** element. Each**srvc** element represents one<br>or a combination of route, direction and stop for which this service<br>bulletin is valid. If the**srvc** element is empty, the service bulletin<br>affects all routes and stops of its feed.|
|**rt**|Child element of**srvc**. Alphanumeric designator of the route (ex.<br>“20” or “X20”) for which this service bulletin is in effect.|
|**rtdir**|Child element of**srvc**. Direction of travel of the route for which this<br>service bulletin is in effect. This matches the direction id seen in the<br>getdirections call.|
|**stpid**|Child element of**srvc**. ID of the stop for which this service bulletin<br>is in effect.|
|**stpnm**|Child element of**srvc**. Name of the stop for which this service<br>bulletin is in effect.|
|**mod**|The date/time of the last service bulletin modification in local time<br>zone in YYYYMMDD HH:MM:SS format|
|**url**|Child element of the**sb** element. Contains URL to site with<br>additional information about this service bulletin.|


**Remarks:**

Use the **getservicebulletins** for a list of service bulletins that are in effect for a route(s) ( **rt** ),
route & direction ( **rt & rtdir** ), route & direction & stop ( **rt & rtdir & stpid** ), or stop(s)
( **stpid** ).

**Note:** At a minimum, the **rt** or **stpid** parameter must be specified.

A service bulletin ( **sb** ) definition without a **srvc** element indicates a “feed-wide” service
bulletin. A service bulletin ( **sb** ) definition without a **srvc** _and_ without a **rtpidatafeed** element
indicates a “system-wide” service bulletin. System-wide service bulletins are valid for all
routes/stops in the system, while feed-wide bulletins only affects routes/stops of that feed.

**Note:** Data feeds with a source of “NEXTBUS” do not support this call.

The service bulletin detail field ( **dtl** ) may contain html tags such as `<b>` or `<a href...>` which
should be supported by the developer.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name=”bustime-response” type=”bustime-response”/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs=”0”
             maxOccurs=”unbounded”/>
             <xs:element name="sb" type="servicebulletin" minOccurs="1"
             maxOccurs="unbounded"/>
         </xs:sequence>

```

**BusTime** **[®]** **Developer API Guide** **33**


**Error Descriptions**

```
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="rtdir" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stpid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="servicebulletin">
         <xs:sequence>
             <xs:element name="nm " type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="sbj" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="dtl" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="brf" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="cse" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="efct" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="prty" type="xs:string" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"
             maxOccurs="1"/>
             <xs:element name="srvc" type="affectedservice" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="lastModified" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="affectedservice">
         <xs:sequence>
             <xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="rtdir" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stpid" type="xs:string" minOccurs="0" maxOccurs="1"/>
             <xs:element name="stpnm" type="xs:string" minOccurs="0" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**

The XML document below is a response to the following request:

**Request:**


http://localhost:8080/bustime/api/v3/getservicebulletins?key=89dj2he89d8j3j3ksjhdue93j&stpid=456

**Response:**

```
<?xml version=”1.0”?>
<bustime-response>
    <sb>
         <sbj>Stop Relocation</sbj>
         <dtl>The westbound stop located at Madison/Lavergne has been moved to the
northeast corner at Madison/Lavergne.</dtl>
         <brf> The westbound stop located at Madison/Lavergne has been moved to the
northeast corner at Madison/Lavergne.</brf>
         <prty>low</prty>
         <srvc>
             <rt>20</rt>
             <rtdir/>
             <stpid/>
             <stpnm/>
         </srvc>
         <mod>20171218 15:22:29</mod>
    </sb>
    <sb>
         <sbj>Stop Relocations/Eliminations</sbj>
         <dtl>Bus stops are being changed to provide faster travel time.</dtl>
         <brf>Bus stops are being changed to provide faster travel time.</brf>
         <prty>low</prty>

```

**34** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
         <srvc>
             <rt/>
             <rtdir/>
             <stpid>456</stpid>
             <stpnm>1ST & 5TH</stpnm>
         </srvc>
         <mod>20171218 15:19:17</mod>
     </sb>
</bustime-response>

```

**Request:**
http://localhost:8080/bustime/api/v3/getservicebulletins?key=89dj2he89d8j3j3ksjhdue93j&rtpidatafeed
=ExternalFeedName&stpid=456&format=json

**Response:**
```
{
     "bustime-response": {
         "sb": [
             {
                  "nm": "System Wide",
                  "sbj": "Sys Wide English",
                  "dtl": "Sys Wide English",
                  "brf": "Sys Wide English",
                  "prty": "Low",
                  "rtpidatafeed": "",
                  "srvc": ,
                  "mod": "20171218 15:22:29"
             },
             {
                  "nm": "Route 1 East",
                  "sbj": "Route 1 East Delays",
                  "dtl": "Route 1 has service delays on the East branches",
                  "brf": "R1 East DELAYED",
                  "prty": "Low",
                  "rtpidatafeed": "ExternalFeedName",
                  "srvc": [
                           {
                               "rt": "1",
                               "rtdir": "EAST",
                               "stpid": "",
                               "stpnm": ""
                           }
                  ],
                  "mod": "20171218 15:19:17"
             }
         ]
     }
}

###### **3.10 Locales**
```

**Base URL: http://[host:port]/bustime/api/v3/getlocalelist**

**Parameters:**






|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**locale**|string(optional)|The language to use for the response.  Must<br>match<br>a <br>supported<br>locale<br>id<br>– <br>See<br>**localestring** below|
|**inLocaleLanguage**|boolean (optional)|Gets each locale with their display names in<br>the native language of the locale when true.<br>If omitted, defaults to false.|



**BusTime** **[®]** **Developer API Guide** **35**


**Error Descriptions**


**Response:**
A well-formed XML or JSON document will be returned as a response to **getlocalelist** .

**Response Fields:**



|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**locale**|Child element of the root element. Encapsulates all data about a<br>locale (language).|
|**localestring**|Child element of the**locale** element. Unique name/identifier of the<br>locale. This is what is passed as the locale parameter in all API<br>calls.<br>The**localestring** contains an ISO 639 language code. Examples are<br>“es”.|
|**displayname**|Child element of the**locale** element. The name of the language. If<br>the locale parameter was included, then this will be in that<br>language. For human-readable use only. If the inLocaleLanguage<br>parameter was true, then this will be in the language of the locale<br>that it represents.|


**Remarks:**





Use the **getlocalelist** to get a list of what languages can be used as the locale parameter. It can
be called a second time with a locale parameter that matches one of the previously returned
localestrings to see the human-readable language names in that given language.

**Note:** The locale parameter in all requests is meant to match values in this list, but it
does support the inheritance model of Java Locale. If the given language is not
supported then the default language of the Transit Authority is used. No indication of
which language used is given in the response, so it is best to use a locale string out of
the list returned by **getlocalelist** .


**XML Schema:**
```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name=”bustime-response” type=”bustime-response”/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs=”0”
             maxOccurs=”unbounded”/>
             <xs:element name="locale" type="locale" minOccurs="1"
             maxOccurs="unbounded"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>

```

**36** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="locale">
         <xs:sequence>
             <xs:element name="localestring" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="displayname" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Examples:**
**Request**
http://localhost:8080/bustime/api/v3/getlocalelist?key=89dj2he89d8j3j3ksjhdue93j

**Response**
```
<?xml version=”1.0”?>
<bustime-response>
<locale>
<localestring>en</localestring>
<displayname>English</displayname>
</locale>
<locale>
<localestring>es</localestring>
<displayname>Spanish</displayname>
</locale>
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getlocalelist?key=89dj2he89d8j3j3ksjhdue93j&locale=es


**Response**
```
<?xml version=”1.0”?>
<bustime-response>
<locale>
<localestring>en</localestring>
<displayname>inglés</displayname>
</locale>
<locale>
<localestring>es</localestring>
<displayname>español</displayname>
</locale>
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getlocalelist?key=89dj2he89d8j3j3ksjhdue93j&inLocaleLanguage
=true


**Response**
```
<?xml version=”1.0”?>
<bustime-response>
<locale>
<localestring>en</localestring>
<displayname>English</displayname>
</locale>
<locale>
<localestring>es</localestring>
<displayname>español</displayname>
</locale>
</bustime-response>

```

**BusTime** **[®]** **Developer API Guide** **37**


**Error Descriptions**

###### **3.11 Real-Time Passenger Information**


**Base URL: http://[host:port]/bustime/api/v3/getrtpidatafeeds**

**Parameters:**

|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|



**Response:**
A well-formed XML or JSON document will be returned as a response to getrtpidatafeeds.

**Response Fields:**







|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**rtpidatafeed** <br>JSON Array:<br>**rtpidatafeeds**|Child element of the root element. Encapsulates an external or<br>internal data feed serviced by the system.|
|**name**|Child element of the**rtpidatafeed** element. Alphanumeric<br>designator of rtpi datafeed (ex. “Nextbus feed”). This is the value<br>that should be used in the rtpidatafeed parameter in other requests.|
|**source**|Child element of the**rtpidatafeed** element. Origin of RTPI<br>information. (ex. “NEXTBUS” for the nextbus TA information).|
|**displayname**|Child element of the**rtpidatafeed** element. TA for which this data<br>feed returns information (ex. “MBTA”).|
|**enabled**|Child element of the**rtpidatafeed** element. True if the feed is<br>enabled; false otherwise.|
|**visible**|Child element of the**rtpidatafeed** element. True if this feed may be<br>displayed to the public; false if the feed is for internal use only.|


**Remarks:**
Use the **getrtpidatafeeds** request to retrieve the set of external and internal data feeds serviced
by the system.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name=”bustime-response” type=”bustime-response”/>
    <xs:complexType name="bustime-response">
    <xs:sequence>
         <xs:element name="rtpidatafeed" maxOccurs="unbounded" minOccurs="0">
    <xs:complexType>
         <xs:sequence>
    <xs:element type="xs:string" name="name" minOccurs="1" maxOccurs="1"/>
    <xs:element type="xs:string" name="source" minOccurs="1" maxOccurs="1"/>
    <xs:element type="xs:string" name="displayname" minOccurs="1"
             maxOccurs="1"/>

```

**38** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
             <xs:element type="xs:boolean" name="enabled" minOccurs="1"
             maxOccurs="1"/>
             <xs:element type="xs:boolean" name="visible" minOccurs="1"
             maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
         </xs:element>
</xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
<xs:sequence>
<xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
    </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getrtpidatafeeds?key=id2YzEgRZ

**Response**
```
<bustime-response>
    <rtpidatafeed>
         <name>bustime</name>
         <source>Bus Tracker</source>
         <displayname>CTA</displayname>
         <enabled>true</enabled>
         <visible>true</visible>
    </rtpidatafeed>
    <rtpidatafeed>
         <name>External Feed</name>
         <source>NEXTBUS</source>
         <displayname>actransit</displayname>
         <enabled>true</enabled>
         <visible>true</visible>
    </rtpidatafeed>
</bustime-response>

```

**BusTime** **[®]** **Developer API Guide** **39**


**Error Descriptions**

###### **3.12 Detours**


**Base URL: http://[host:port]/bustime/api/v3/getdetours**
**Parameters:**







|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rt**|route designator<br>(optional)|Alphanumeric designator of the route (ex.<br>“20” or “X20”) for which a list of detours is<br>to be returned.|
|**rtdir**|route direction<br>(optional)|Direction of travel of the route specified in<br>the**rt** parameter. The**rt** parameter is required<br>when using the**rtdir** parameter. This needs<br>to match the direction id seen in the<br>getdirections call.|
|**rtpidatafeed**|(multi-feed only)<br>string (optional)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve detours for.<br>Required in multi-feed systems if the rt<br>parameter is provided.|


**Response:**
A well-formed XML or JSON document will be returned as a response to getdetours.

**Response Fields:**



|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**dtr** <br>JSON Array:**dtrs**|Child element of the root element. Encapsulates data about a detour.|
|**id**|Child element of the**dtr** element. The unique id of the detour.<br>Other API calls reference these identifiers.|
|**ver**|Child element of the**dtr** element. The version of this detour. Only<br>the newest version of each detour is returned.|
|**st**|Child element of the**dtr** element. The state of the detour. A value<br>of 1 indicates the detour is active; 0 indicates a canceled detour.|
|**desc**|Child element of the**dtr** element. Description of the detour.|
|**rtdirs**|Child element of the**dtr** element. Contains a series of**rtdir** <br>elements.|
|**rtdir**|Child element of the**rtdirs** element. Contains a pair of the route<br>and direction affected by the detour.|
|**rt**|Child element of the**rtdir** element. Alphanumeric designator of a<br>route (ex. “20” or “X20”) affected by the detour.|
|**dir**|Child element of the**rtdir** element. The direction affected by the<br>detour.|
|**startdt**|Child element of the**dtr** element. The start date and time of this|


**40** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

|Col1|detour.|
|---|---|
|**enddt**|Child element of the**dtr** element. The end date and time of this<br>detour.|
|**rtpidatafeed**|(Multi-feed only) Child element of the**dtr** element. The name of<br>the data feed that this detour was retrieved from.|



**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name=”bustime-response” type=”bustime-response”/>
    <xs:complexType name="bustime-response">
    <xs:sequence>
         <xs:element name="dtr" maxOccurs="unbounded" minOccurs="0">
    <xs:complexType>
         <xs:sequence>
    <xs:element type="xs:string" name="id" minOccurs="1" maxOccurs="1"/>
    <xs:element type="xs:int" name="ver" minOccurs="1" maxOccurs="1"/>
             <xs:element type="xs:int" name="st" minOccurs="1" maxOccurs="1"/>
    <xs:element type="xs:string" name="desc" minOccurs="1" maxOccurs="1"/>
             <xs:element name="rtdirs" minOccurs="1" maxOccurs="1">
             <xs:complexType>
             <xs:sequence>
             <xs:element name="rtdir" minOccurs="0" maxOccurs="unbounded">
             <xs:complexType>
             <xs:sequence>
             <xs:element type="xs:string" name="rt" minOccurs="1"
         maxOccurs="1"/>
             <xs:element type="xs:string" name="dir" minOccurs="1"
         maxOccurs="1"/>
             </xs:sequence>
             </xs:complexType>
             </xs:element>
             </xs:sequence>
             </xs:complexType>
             </xs:element>
             <xs:element type="xs:string" name="startdt" minOccurs="1" maxOccurs="1"/>
             <xs:element type="xs:string" name="enddt" minOccurs="1" maxOccurs="1"/>
             <xs:element type="xs:string" name="rtpidatafeed" minOccurs="0"
             maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
         </xs:element>
</xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
<xs:sequence>
<xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
<xs:element name="rt" type="xs:string" minOccurs="0" maxOccurs="1"/>
<xs:element name="rtdir" type="xs:string" minOccurs="0" maxOccurs="1"/>
<xs:element name="rtpidatafeed" type="xs:string" minOccurs="0" maxOccurs="1"/>
    </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Examples:**
**Request**
http://localhost:8080/bustime/api/v3/getdetours?key=89dj2he89d8j3j3ksjhdue93j
**Response**
```
<bustime-response>
    <dtr>
         <id>84A97FD3-0741-4004-884D-0ABB22DAFA28</id>
         <ver>2</ver>
         <st>0</st>
         <desc>IVD MultiRoute detour 47</desc>

```

**BusTime** **[®]** **Developer API Guide** **41**


**Error Descriptions**

```
         <rtdirs>
             <rtdir>
                  <rt>72</rt>
                  <dir>NORTHBOUND</dir>
             </rtdir>
         </rtdirs>
         <startdt>20180404 08:45</startdt>
         <enddt>20180430 03:00</enddt>
         <rtpidatafeed>bustime</rtpidatafeed>
    </dtr>
    <dtr>
         <id>329E1F2D-A848-43E9-8F90-4FB00E643786</id>
         <ver>1</ver>
         <st>1</st>
         <desc>IVD Multiroute Detour S47/62</desc>
         <rtdirs>
             <rtdir>
                  <rt>800</rt>
                  <dir>EASTBOUND</dir>
             </rtdir>
             <rtdir>
                  <rt>72M</rt>
                  <dir>NORTHBOUND</dir>
             </rtdir>
         </rtdirs>
         <startdt>20180404 09:06</startdt>
         <enddt>20180430 03:00</enddt>
         <rtpidatafeed>bustime</rtpidatafeed>
    </dtr>
</bustime-response>
```

**Request:**
http://localhost:8080/bustime/api/v3/getdetours?key=89dj2he89d8j3j3ksjhdue93j&rt=2&format=json
**Response:**
```
{
    "bustime-response": {
         "dtrs": [
             {
                  "id": "84A97FD3-0741-4004-884D-0ABB22DAFA28",
                  "ver": 2,
                  "st": 0,
                  "desc": "IVD MultiRoute detour 47",
                  "rtdirs": [
                      {
                           "rt": "72",
                           "dir": "NORTHBOUND"
                      }
                  ],
                  "startdt": "20180404 08:45",
                  "enddt": "20180430 03:00",
                  "rtpidatafeed": "bustime"
             },
             {
                  "id": "329E1F2D-A848-43E9-8F90-4FB00E643786",
                  "ver": 1,
                  "st": 1,
                  "desc": "IVD Multiroute Detour S47/62",
                  "rtdirs": [
                      {
                           "rt": "800",
                           "dir": "EASTBOUND"
                      },
                      {
                           "rt": "72M",
                           "dir": "NORTHBOUND"
                      }
                  ],
                  "startdt": "20180404 09:06",
                  "enddt": "20180430 03:00",
                  "rtpidatafeed": "bustime"
             }

```

**42** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
         ]
    }
}
```

**Remarks:**
Use the **getdetours** request to retrieve a list of active detours in the system. Detours are
considered “active” if they are currently affecting the current service day, even if the start time
has not yet been reached or the end time has already passed.

The response only contains metadata about the detour. The pattern data for the detour can be
displayed via the **getpatterns** request when an end user selects a route(s) affected by the
detour.

If a detour is canceled or expired, it will still appear in this result. This is to handle cases where
a vehicle is still running a canceled or expired detour and the developer wishes to alert users
that the detour is technically still in effect.

If the client application is to support detours, it is recommended that detours are requested
frequently in case a new version is added or a detour is canceled. If a current detour or new
version is added (or removed), the client should consider requesting new stop and pattern data
for the given route/direction combination in case data has been changed by the detour.

**Note:** Data feeds with a source of “NEXTBUS”, “SYNCROMATICS” and “GTFS” do
not support this call.


**BusTime** **[®]** **Developer API Guide** **43**


**Error Descriptions**

###### **3.13 Enhanced Detours**


**Base URL: http://[host:port]/bustime/api/v3/getenhanceddetours**
**Parameters:**

|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rtpidatafeed**|string (optional)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve detours for.<br>If not specified, detours are retrieved for all<br>available feeds.|



**Response:**
A well-formed XML or JSON document will be returned as a response to getenhanceddetours.

**Response Fields:**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**dtr** <br>JSON Array:**dtrs**|Child element of the root element. Encapsulates data about a detour.|
|**id**|Child element of the**dtr** element. The unique id of the detour.<br>Other API calls reference these identifiers.|
|**ver**|Child element of the**dtr** element. The version of this detour. Only<br>the newest version of each detour is returned.|
|**st**|Child element of the**dtr** element. The state of the detour. A value<br>of 1 indicates the detour is active; 0 indicates a canceled detour.|
|**desc**|Child element of the**dtr** element. Description of the detour.|
|**rtdirs**|Child element of the**dtr** element. Contains a series of**rtdir** <br>elements.|
|**rtdir**|Child element of the**rtdirs** element. Contains a pair of the route<br>and direction affected by the detour.|
|**rt**|Child element of the**rtdir** element. Alphanumeric designator of a<br>route (ex. “20” or “X20”) affected by the detour.|
|**dir**|Child element of the**rtdir** element. The direction affected by the<br>detour.|
|**startdt**|Child element of the**dtr** element. The start date and time of this<br>detour represented in Epoch format.|
|**enddt**|Child element of the**dtr** element. The end date and time of this<br>detour represented in Epoch format.|
|**moddt**|Child element of the**dtr** element. The last modified date and time<br>of this detour represented in Epoch format.|
|**rtpidatafeed**|(Multi-feed only) Child element of the**dtr** element. The name of<br>the data feed that this detour was retrieved from.|
|**ptrs**|Child element of the**dtr** element. Encloses pattern details for all|



**44** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**



















|Col1|patterns affected by the detour.|
|---|---|
|**ptr**|Child element of the**ptrs** element. Provides pattern details affected<br>by the detour.|
|**origpid**|Child element of the**ptr** element. Original pattern ID that the<br>detour affects.|
|**dtrpid**|Child element of the**ptr** element. Detour pattern ID.|
|**encpl**|Child element of the**ptr** element. The detour’s polyline information<br>encoded using Google’s Encoded Polyline algorithm.|
|**trips**|Child element of the**ptr** element. An array of trips affected by the<br>detour.|
|**trip**|Child element of the**dtr** element. A trip affected by the detour.|
|**tripid**|Child element of the**trip** element. Trip identifier.|
|**tatripid**|Child element of the**trip** element. TA’s version of the scheduled<br>trip identifier.|
|**origtatripno**|Child element of the**trip** element. Trip ID defined by the TA<br>scheduling system.|
|**dates**|Child element of the**trip** element. Dates on which the trip is active<br>between the start and end dates of the detour.|
|**date**|Child element of the**dates** element. Date on which the trip is active,<br>between the start and end dates of the detour. Format:<br>YYYYMMDD|
|**stst**|Child element of the**trip** element. Start time of the trip in seconds<br>from midnight.|
|**modifications**|Child element of the**ptr** element. An array of modifications created<br>by the detour.|
|**modification**|Child element of the**modifications** element. A modification<br>representing a segment that has changed in the detour.|
|**dtrstartstop**|Child element of the**modification** element. The stop in the pattern<br>at which the detour starts.|
|**dtrendstop**|Child element of the**modification** element. The stop in the pattern<br>where the detour ends.|
|**delay**|Child element of the**modification** element. Delay time in seconds<br>starting from the end of detour as compared to the original<br>schedule.|
|**repstops**|Child element of the**dtr** element. An array of stops replaced in the<br>detour pattern by the detour in comparison to the original pattern.|
|**repstop**|Child element of the**repstops** element. A stop replaced in the<br>detour pattern by the detour in comparison to the original pattern.|
|**geoid**|Child element of the**dtrstartstop / dtrendstop / repstop** element.<br>The stop’s internal ID. The GeoID correlates to GTFS export -><br>stops.txt -> stop_id.|
|**stpid**|Child element of the**dtrstartstop / dtrendstop / repstop** element.<br>Unique identifier representing this stop.|
|**seq**|Child element of the**dtrstartstop / dtrendstop / repstop** element.<br>Sequence of the stop in the trip.|
|**stpnm**|Child element of the**dtrstartstop / dtrendstop / repstop** element.|


**BusTime** **[®]** **Developer API Guide** **45**


**Error Descriptions**

|Col1|Display name of this stop (ex. “Madison and Clark”).|
|---|---|
|**lat**|Child element of the**repstop** element. Latitude position of the stop<br>in decimal degrees (WGS 84).|
|**lon**|Child element of the**repstop** element. Longitude position of the<br>stop in decimal degrees (WGS 84).|
|**adhoc**|Child element of the**repstop** element. Boolean value determining<br>whether the stop was added adhoc or an existing stop.|
|**relpasstime**|Child element of the**repstop** element. Time in seconds when this<br>stop occurs in the pattern after the previous stop.|
|**sbnm**|Child element of the**dtr** element. The unique name/identifier of the<br>service bulletin, if present for the detour.|



**Remarks:**
The getenhanceddetours endpoint is implemented for use by GTFS-RT system. All the detours
that are currently active or are going to be active in the future are retrieved. This API endpoint
only returns data when detour support is enabled in BusTime.

**Note:** Data feeds with a source of “NEXTBUS”, “SYNCHROMATICS” and “GTFS” do not
support this call.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:simpleType name="epochMillisType">
<xs:restriction base="xs:long">
<xs:minInclusive value="0"/>
</xs:restriction>
</xs:simpleType>

<xs:simpleType name="latitudeType">
<xs:restriction base="xs:decimal">
<xs:minInclusive value="-90"/>
<xs:maxInclusive value="90"/>
</xs:restriction>
</xs:simpleType>

<xs:simpleType name="longitudeType">
<xs:restriction base="xs:decimal">
<xs:minInclusive value="-180"/>
<xs:maxInclusive value="180"/>
</xs:restriction>
</xs:simpleType>

<xs:element name="bustime-response">
<xs:complexType>
<xs:sequence>
<xs:element name="dtr" type="dtrType"/>
</xs:sequence>
</xs:complexType>
</xs:element>

<xs:complexType name="dtrType">
<xs:sequence>
<xs:element name="id" type="xs:string"/>
<xs:element name="ver" type="xs:long"/>
<xs:element name="st" type="xs:long"/>
<xs:element name="desc" type="xs:string"/>
<xs:element name="rtdirs" type="rtdirsType"/>
<xs:element name="startdt" type="epochMillisType"/>
<xs:element name="enddt" type="epochMillisType"/>
<xs:element name="moddt" type="epochMillisType"/>

```

**46** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
<xs:element name="ptrs" type="ptrsType"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="rtdirsType">
<xs:sequence>
<xs:element name="rtdir" type="rtdirType" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="rtdirType">
<xs:sequence>
<xs:element name="rt" type="xs:long"/>
<xs:element name="dir" type="xs:string"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="ptrsType">
<xs:sequence>
<xs:element name="ptr" type="ptrType" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="ptrType">
<xs:sequence>
<xs:element name="origpid" type="xs:long"/>
<xs:element name="dtrpid" type="xs:long"/>
<xs:element name="encpl" type="xs:string"/>
<xs:element name="trips" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:any minOccurs="0" maxOccurs="unbounded" processContents="lax"/>
</xs:sequence>
</xs:complexType>
</xs:element>
<xs:element name="modifications" type="modificationsType"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="modificationsType">
<xs:sequence>
<xs:element name="modification" type="modificationType" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="modificationType">
<xs:sequence>
<xs:element name="dtrstartstop" type="dtrStopType"/>
<xs:element name="dtrendstop" type="dtrStopType" minOccurs="0"/>
<xs:element name="repstops" type="repstopsType"/>
<xs:element name="delay" type="xs:long"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="dtrStopType">
<xs:sequence>
<xs:element name="geoid" type="xs:long"/>
<xs:element name="stpid" type="xs:long"/>
<xs:element name="seq" type="xs:long"/>
<xs:element name="stpnm" type="xs:string"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="repstopsType">
<xs:sequence>
<xs:element name="repstop" type="repstopType" minOccurs="0" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="repstopType">
<xs:sequence>

```

**BusTime** **[®]** **Developer API Guide** **47**


**Error Descriptions**

```
<xs:element name="geoid" type="xs:long"/>
<xs:element name="stpid" type="xs:long"/>
<xs:element name="seq" type="xs:long"/>
<xs:element name="stpnm" type="xs:string"/>
<xs:element name="lat" type="latitudeType"/>
<xs:element name="lon" type="longitudeType"/>
<xs:element name="adhoc" type="xs:boolean"/>
<xs:element name="relpasstime" type="xs:long"/>
</xs:sequence>
</xs:complexType>

</xs:schema>

```

**Examples:**

**Request**
http://localhost:8080/bustime/api/v3/getenhanceddetours?key=89dj2he89d8j3j3ksjhdue93j
**Response**
```
<bustime-response>
<dtr>
<id>99763A30-7C49-4CE7-9F46-104F72CD6F92</id>
<ver>8</ver>
<st>1</st>
<desc>Detour with stops added and removed in multiple segments</desc>
<rtdirs>
<rtdir>
<rt>169</rt>
<dir>East Bound</dir>
</rtdir>
</rtdirs>
<startdt>1765774800000</startdt>
<enddt>1767243599000</enddt>
<moddt>1765851069000</moddt>
<ptrs>
<ptr>
<origpid>7006</origpid>
<dtrpid>502683</dtrpid>

<encpl>utx}Fd~kwO??K^_@]?AQ[}@q@IYi@i@gMkIcAWH[A?GZk@a@As@}FcEWCyFgEaAUKJCh@LbETr_@Bj@Nt@THrtAu
BpASfAq@jToZ|N}RbCyCHS?o@kJkPqFaLaHiPsJuVmSeg@mCqI_@qAiAmGmEs^oAmJkBoLu@wD_HiRw@gCa@gBOmBM}CmA_
bCmAczAa@ms@sD}xIAk@?@GCc@_z@F??AG@Wci@D???E?KaQFW??I?s@_tBF???G?Gq^Qa_@OeJUmp@Ka@@wEMcOo@}vBo@
gaB{@@EQ???NgIRcl@Vkt@r@c@?A??As@@m@yxAH?@AK@GuEFcCKuHCsOG_@D}@FY</encpl>
<trips>
...
</trips>
<modifications>
<modification>
<dtrstartstop>
<geoid>3663</geoid>
<stpid>8628</stpid>
<seq>1</seq>
<stpnm>Ups Facility Stop 2</stpnm>
</dtrstartstop>
<repstops>
<repstop>
<geoid>3678</geoid>
<stpid>8627</stpid>
<seq>1</seq>
<stpnm>Ups Facility Stop 1</stpnm>
<lat>41.74682999999984</lat>
<lon>-87.88467400000002</lon>
<adhoc>false</adhoc>
<relpasstime>0</relpasstime>
</repstop>
</repstops>
<delay>1864</delay>
</modification>
<modification>

```

**48** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
<dtrstartstop>
<geoid>3664</geoid>
<stpid>2728</stpid>
<seq>3</seq>
<stpnm>79th Street & Pulaski</stpnm>
</dtrstartstop>
<repstops>
<repstop>
<geoid>18229</geoid>
<stpid>15530</stpid>
<seq>4</seq>
<stpnm>79th Street & Kostner</stpnm>
<lat>41.74923700000115</lat>
<lon>-87.73112600000101</lon>
<adhoc>false</adhoc>
<relpasstime>96</relpasstime>
</repstop>
<repstop>
<geoid>5559</geoid>
<stpid>2727</stpid>
<seq>5</seq>
<stpnm>79th Street & Karlov </stpnm>
<lat>41.749374000001</lat>
<lon>-87.72438799999952</lon>
<adhoc>false</adhoc>
<relpasstime>66</relpasstime>
</repstop>
</repstops>
<delay>2493</delay>
</modification>
<modification>
<dtrstartstop>
<geoid>24593</geoid>
<stpid>8630</stpid>
<seq>5</seq>
<stpnm>79th Street & Western</stpnm>
</dtrstartstop>
<dtrendstop>
<geoid>20521</geoid>
<stpid>2754</stpid>
<seq>6</seq>
<stpnm>79th Street & Ashland</stpnm>
</dtrendstop>
<repstops> </repstops>
<delay>2404</delay>
</modification>
<modification>
<dtrstartstop>
<geoid>3671</geoid>
<stpid>8629</stpid>
<seq>10</seq>
<stpnm>69th Street & State (Red Line)</stpnm>
</dtrstartstop>
<dtrendstop>
<geoid>3671</geoid>
<stpid>8629</stpid>
<seq>10</seq>
<stpnm>69th Street & State (Red Line)</stpnm>
</dtrendstop>
<repstops>
<repstop>
<geoid>4119</geoid>
<stpid>7215</stpid>
<seq>11</seq>
<stpnm>69th Street & Wabash</stpnm>
<lat>41.76911000000098</lat>
<lon>-87.62360999999868</lon>
<adhoc>false</adhoc>
<relpasstime>74</relpasstime>
</repstop>
</repstops>

```

**BusTime** **[®]** **Developer API Guide** **49**


**Error Descriptions**

```
</modification>
</modifications>
</ptr>
</ptrs>
</dtr>
</bustime-response>

```

**Request:**
http://localhost:8080/bustime/api/v3/getenhanceddetours?key=89dj2he89d8j3j3ksjhdue93j&format=jso
n
**Response:**
```
{
"bustime-response": {
"dtrs": [
{
"id": "99763A30-7C49-4CE7-9F46-104F72CD6F92",
"ver": 8,
"st": 1,
"desc": "Detour with stops added and removed in multiple segments",
"rtdirs": [
{
"rt": "169",
"dir": "East Bound"
}
],
"startdt": 1765774800000,
"enddt": 1767243599000,
"moddt": 1765851069000,
"ptrs": [
{
"origpid": 7006,
"dtrpid": 502683,
"encpl":
"utx}Fd~kwO??K^_@]?AQ[}@q@IYi@i@gMkIcAWH[A?GZk@a@As@}FcEWCyFgEaAUKJCh@LbETr_@Bj@Nt@THrtAuBpASfA
q@jToZ|N}RbCyCHS?o@kJkPqFaLaHiPsJuVmSeg@mCqI_@qAiAmGmEs^oAmJkBoLu@wD_HiRw@gCa@gBOmBM}CmA_bCmAcz
Aa@ms@sD}xIAk@?@GCc@_z@F??AG@Wci@D???E?KaQFW??I?s@_tBF???G?Gq^Qa_@OeJUmp@Ka@@wEMcOo@}vBo@gaB{@@
EQ???NgIRcl@Vkt@r@c@?A??As@@m@yxAH?@AK@GuEFcCKuHCsOG_@D}@FY",
"trips": [
{
"tripid": 22500020,
"tatripid": "2",
"origtatripno": "267684376",
"dates": [
"20251215",
"20251216",
"20251217",
"20251218",
"20251219",
"20251222",
"20251223",
"20251224",
"20251225",
"20251226",
"20251229",
"20251230",
"20251231"
],
"stst": 35100
},
{
"tripid": 40104020,
"tatripid": "6",
"origtatripno": "267684378",
"dates": [
"20251215",
"20251216",
"20251217",
"20251218",
"20251219",

```

**50** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
"20251222",
"20251223",
"20251224",
"20251225",
"20251226",
"20251229",
"20251230",
"20251231"
],
"stst": 54900
},
{
"tripid": 9646020,
"tatripid": "10",
"origtatripno": "267684380",
"dates": [
"20251215",
"20251216",
"20251217",
"20251218",
"20251219",
"20251222",
"20251223",
"20251224",
"20251225",
"20251226",
"20251229",
"20251230",
"20251231"
],
"stst": 99600
},
{
"tripid": 49122020,
"tatripid": "88347167",
"origtatripno": "267684379",
"dates": [
"20251215",
"20251216",
"20251217",
"20251218",
"20251219",
"20251222",
"20251223",
"20251224",
"20251225",
"20251226",
"20251229",
"20251230",
"20251231"
],
"stst": 78600
},
{
"tripid": 25419020,
"tatripid": "88347161",
"origtatripno": "267684377",
"dates": [
"20251215",
"20251216",
"20251217",
"20251218",
"20251219",
"20251222",
"20251223",
"20251224",
"20251225",
"20251226",
"20251229",
"20251230",
"20251231"

```

**BusTime** **[®]** **Developer API Guide** **51**


**Error Descriptions**

```
],
"stst": 35400
}
],
"modifications": [
{
“dtrstartstop”: {
"geoid": 3663,
"stpid": "8628",
"stpnm": "Ups Facility Stop 2",
"seq": 1
},
“repstops”: [
{
"geoid": 3678,
"stpid": "8627",
"stpnm": "Ups Facility Stop 1",
"seq": 1,
"lat": 41.74682999999984,
"lon": -87.88467400000002,
"adhoc": false,
"relpasstime": 0
}
],
"delay": 1864
},
{
“dtrstartstop”: {
"geoid": 3664,
"stpid": "2728",
"stpnm": "79th Street & Pulaski",
"seq": 3
},
“repstops”: [
{
"geoid": 18229,
"stpid": "15530",
"stpnm": "79th Street & Kostner",
"seq": 4,
"lat": 41.74923700000115,
"lon": -87.73112600000101,
"adhoc": false,
"relpasstime": 96
},
{
"geoid": 5559,
"stpid": "2727",
"stpnm": "79th Street & Karlov ",
"seq": 5,
"lat": 41.749374000001,
"lon": -87.72438799999952,
"adhoc": false,
"relpasstime": 66
}
],
"delay": 2493
},
{
“dtrstartstop”: {
"geoid": 24593,
"stpid": "8630",
"stpnm": "79th Street & Western",
"seq": 5
},
“dtrendstop”: {
"geoid": 20521,
"stpid": "2754",
"stpnm": "79th Street & Ashland",
"seq": 6
},
“repstops”: ,

```

**52** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
"delay": 2404
},
{
“dtrstartstop”: {
"geoid": 3671,
"stpid": "8629",
"stpnm": "69th Street & State (Red Line)",
"seq": 10
},
“dtrendstop”: {
"geoid": 3671,
"stpid": "8629",
"stpnm": "69th Street & State (Red Line)",
"seq": 10
},
“repstops”: [
{
"geoid": 4119,
"stpid": "7215",
"stpnm": "69th Street & Wabash",
"seq": 11,
"lat": 41.76911000000098,
"lon": -87.62360999999868,
"adhoc": false,
"relpasstime": 74
}
],
"delay": 0
}
]
}
]
}
]
}
}

```

**BusTime** **[®]** **Developer API Guide** **53**


**Error Descriptions**

###### **3.14 Bus Bridges**

**Base URL: http://[host:port]/bustime/api/v3/getbusbridges**
**Parameters:**

|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|
|**rtpidatafeed**|string (optional)|Specify the name of the Real-Time Passenger<br>Information data feed to retrieve bus bridges<br>for. If not specified, bus bridges are retrieved<br>for all available feeds.|



**Response:**
A well-formed XML or JSON document will be returned as a response to getbusbridges.

**Response Fields:**

|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**bb** <br>JSON Array:**bbs**|Child element of the root element. Encapsulates data about a bus<br>bridge.|
|**id**|Child element of the**bb** element. The unique id of the bus bridge.|
|**ver**|Child element of the**bb** element. The version of this bus bridge.<br>Only the newest version of each bus bridge is returned.|
|**st**|Child element of the**bb** element. The state of the bus bridge. A<br>value of 1 indicates the bus bridge is active; 0 indicates a canceled<br>bus bridge.|
|**desc**|Child element of the**bb** element. Description of the bus bridge.|
|**moddt**|Child element of the**bb** element. The modification date and time of<br>the bus bridge represented in Epoch format.|
|**startdt**|Child element of the**bb** element. The start date and time of the bus<br>bridge represented in Epoch format.|
|**enddt**|Child element of the**bb** element. The end date and time of the bus<br>bridge represented in Epoch format.|
|**rt**|Child element of the**bb** element. Alphanumeric designator of the<br>route (ex. “20” or “X20”) created by the bus bridge.|
|**newrt**|Child element of the**bb** element. Flag indicating if the route is new<br>(true) or is in the original schedule (false).|
|**ptrs**|Child element of the**bb** element. Encloses pattern details for all<br>patterns affected by the bus bridge.|
|**ptr**|Child element of the**ptrs** element. Provides pattern details affected<br>by the bus bridge.|
|**pid**|Child element of the**ptr** element. Pattern ID of the pattern affected<br>by the bus bridge.|
|**encpl**|Child element of the**ptr** element. The bus bridge’s polyline<br>information encoded using Google’s Encoded Polyline algorithm.|



**54** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

|trips|Child element of the ptr element. An array of trip IDs affected by<br>the bus bridge.|
|---|---|
|**tripid**|Child element of the**trips** element. A trip ID affected by the bus<br>bridge.|
|**rtpidatafeed**|(Multi-feed only) Child element of the**bb** element. The name of the<br>data feed that this bus bridge was retrieved from.|



**Remarks:**
The getbusbridges endpoint is implemented for use by GTFS-RT system. All the bus bridges
that are currently active or are going to be active in the future are retrieved. This API endpoint
only returns data when bus bridge support is enabled in BusTime.

**Note:** Data feeds with a source of “NEXTBUS”, “SYNCHROMATICS” and “GTFS” do not
support this call.


**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
<xs:complexType name="bustime-response">
<xs:sequence>
<xs:element name="error" type="error" minOccurs="0" maxOccurs="unbounded"/>
<xs:element name="bb" type="bb" minOccurs="0" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>

<xs:complexType name="bb">
<xs:sequence>
<xs:element name="id" type="xs:string"/>
<xs:element name="ver" type="xs:int"/>
<xs:element name="st" type="xs:string"/>
<xs:element name="desc" type="xs:string"/>
<xs:element name="moddt" type="xs:long"/>
<xs:element name="startdt" type="xs:long"/>
<xs:element name="enddt" type="xs:long"/>
<xs:element name="rt" type="xs:string"/>
<xs:element name="newrt" type="xs:boolean"/>
<xs:element name="rtpidatafeed" type="xs:string" minOccurs="0"/>
<xs:element name="ptrs">
<xs:complexType>
<xs:sequence>
<xs:element name="ptr" type="pattern" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>
</xs:element>    </xs:sequence>
</xs:complexType>

<xs:complexType name="pattern">
<xs:sequence>
<xs:element name="pid" type="xs:int"/>
<xs:element name="encpl" type="xs:string"/>
    <xs:element name="trips">
         <xs:complexType>
         <xs:sequence>
             <xs:element name="tripid" type="xs:string" minOccurs="0"
    maxOccurs="unbounded"/>
    </xs:sequence>
         </xs:complexType>
    </xs:element>
    </xs:sequence>
</xs:complexType>

```

**BusTime** **[®]** **Developer API Guide** **55**


**Error Descriptions**

```
<xs:complexType name="error">
<xs:sequence>
<xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
    <xs:element name="rtpidatafeed" type="xs:string" minOccurs="0" maxOccurs="1"/>
</xs:sequence>
</xs:complexType>
</xs:schema>

```

**Examples:**

**Request**
http://localhost:8080/bustime/api/v3/getbusbridges?key=89dj2he89d8j3j3ksjhdue93j
**Response**
```
<bustime-response>
<bb>
<id>3</id>
<ver>3</ver>
<st>1</st>
<desc>Test 1</desc>
<moddt>20251013 14:45</moddt>
<startdt>20251010 00:00</startdt>
<enddt>20251015 00:00</enddt>
<rt>123</rt>
<newrt>true</newrt>
<ptrs>
<ptr>
<pid>500007</pid>
<encpl>i|`tDlfnuN??AoEgIUFstA?i@??Fo\}_@_@a@?</encpl>
    <trips>
    <tripid>2000000000</tripid>
    <tripid>2000000001</tripid>
    <tripid>2000000002</tripid>
    <tripid>2000000003</tripid>
    <tripid>2000000004</tripid>
    </trips>
</ptr>
<ptr>
<pid>500008</pid>
    <encpl>
g}yeG~|haP?AVq@Gw@YaAsE{Gk@oAWiAKy@GqEBqB~\RIqWIeeBKw^BuMIcI?ui@FeF@_ZQ???P?Jct@Tee@BqNEkZG_CEa
@o@uAqGyJ}IaM{PqW{F{HaSCeCF_BVqDXyCQ{E`@mINk@DyAf@]T{@dA[f@q@pBk@UQWAeBVAencpl>
    <trips>
    <tripid>2000000010</tripid>
    <tripid>2000000011</tripid>
    <tripid>2000000012</tripid>
    <tripid>2000000013</tripid>
    <tripid>2000000014</tripid>
    </trips>
</ptr>
</ptrs>
</bb>
<bb>
<id>4</id>
<ver>1</ver>
<st>1</st>
<desc>Test 3 - Future</desc>
<moddt>20251014 14:05</moddt>
<startdt>20251015 00:00</startdt>
<enddt>20251016 00:00</enddt>
<rt>345</rt>
<newrt>true</newrt>
<ptrs>
<ptr>
<pid>500011</pid>

```

**56** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

```
<encpl>
ma~sDhknuN??H??X~F?E}HaG??l@F`@AvA@jAAvG@bAYMcIJHkQml@?Fb@?l@e@@KSJRd@A?jFGtAWtBIjAC`QBjB?pA@`A
Ef\j@lI?@@P?V@HElDYxDK~C@rAIzaA@zB?nD?gAfm@??iLMcGO??AN@?eAmE??RlEAEpD@fC?x@@nAAtJBdE?vBB`@CbC`
AMr@Qr@_@~@{@VKrAMqFsT]Su@@CgEKeB?eD_K?@mBHQAyGnJAH~CCrE|E@lAX|@z@\N^@~@UfCcAnIAhApBJI</encpl>
    <trips> </trips>
</ptr>
</ptrs>
</bb>
</bustime-response>

```

**Request:**
http://localhost:8080/bustime/api/v3/getbusbridges?key=89dj2he89d8j3j3ksjhdue93j&format=json
**Response:**
```
{
    "bustime-response": {
         "bbs": [
             {
                  "id": "3",
                  "ver": 1,
                  "st": 1,
                  "desc": "Test 1",
                  "moddt": 1760381120000,
                  "startdt": 1760068800000,
                  "enddt": 1760500800000,
                  "rt": "123",
                  "newrt": true,
                  "ptrns": [
                      {
                           "pid": 500007,
                           "encpl":"i|`tDlfnuN??AoEgIUFstA?i@??Fo\\}_@_@a@?",
                           "trips": [
                               "2000000000",
                               "2000000001",
                               "2000000002",
                               "2000000003",
                               "2000000004"
                           ]
                      },
                      {
                           "pid": 500008,
                           "encpl":
"g}yeG~|haP?AVq@Gw@YaAsE{Gk@oAWiAKy@GqEBqB~\RIqWIeeBKw^BuMIcI?ui@FeF@_ZQ???P?Jct@Tee@BqNEkZG_CE
a@o@uAqGyJ}IaM{PqW{F{HaSCeCF_BVqDXyCQ{E`@mINk@DyAf@]T{@dA[f@q@pBk@UQWAeBVA@?",
                           "trips": [
                               "2000000010",
                               "2000000011",
                               "2000000012",
                               "2000000013",
                               "2000000014"
                           ]

                      }
                  ]
             },
             {
                  "id": "4",
                  "ver": 1,
                  "st": 1,
                  "desc": "Test 3 - Future",
                  "moddt": 1760465118000,
                  "startdt": 1760500800000,
                  "enddt": 1760587200000,
                  "rt": "345",
                  "newrt": true,
                  "ptrns": [
                      {
                           "pid": 500011,

```

**BusTime** **[®]** **Developer API Guide** **57**


**Error Descriptions**

```
                           "encpl":
"ma~sDhknuN??H??X~F?E}HaG??l@F`@AvA@jAAvG@bAYMcIJHkQml@?Fb@?l@e@@KSJRd@A?jFGtAWtBIjAC`QBjB?pA@`
AEf\j@lI?@@P?V@HElDYxDK~C@rAIzaA@zB?nD?gAfm@??iLMcGO??AN@?eAmE??RlEAEpD@fC?x@@nAAtJBdE?vBB`@CbC
`AMr@Qr@_@~@{@VKrAMqFsT]Su@@CgEKeB?eD_K?@mBHQAyGnJAH~CCrE|E@lAX|@z@\N^@~@UfCcAnIAhApBJI",
                           "trips": 

                      }
                  ]
             }
         ]
    }
}

```

**58** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

###### **3.15 Agencies**

**Base URL: http://[host:port]/bustime/api/v3/getagencies**

**Parameters**

|Name|Value|Description|
|---|---|---|
|**key**|string (required)|25-digit BusTime Developer API access key.|



**Response:**
A well-formed XML or JSON document will be returned as a response to **getagencies** .

**Response Fields** :







|Name|Description|
|---|---|
|**bustime-response**|Root element of the response document.|
|**error**|Child element of the root element. Message if the processing of the<br>request resulted in an error.|
|**agency** <br>JSON Array: <br>**agencies**|Child element of the root element. Encapsulates details for an<br>agency imported in the system.|
|**agencyid**|Child element of the**agency** element. Numeric identifier for the<br>agency referenced by GTFS. The agencyid can be null and may<br>not necessarily be unique to each agency. When null, the attribute<br>will not be populated in the response.|
|**shortname**|Child element of the**agency** element. Short alphanumeric name of<br>the agency. This also serves as a unique identifier.|
|**longname**|Child element of the**agency** element. The longer descriptive name<br>of the agency. In the current implementation, longname is the same<br>as shortname.|


**Remarks:**
Use the **getagencies** request to retrieve the list of agencies imported in the system. The API
returns an error message when there are no agencies imported.

**Note:** Data feeds with a source of “GTFS” do not support this call.

**XML Schema:**

```
<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="bustime-response" type="bustime-response"/>
    <xs:complexType name="bustime-response">
         <xs:sequence>
             <xs:element name="error" type="error" minOccurs="0"
             maxOccurs="unbounded"/>
             <xs:element name="route" type="route" minOccurs="0"
             maxOccurs="unbounded"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="error">
         <xs:sequence>
             <xs:element name="msg" type="xs:string" minOccurs="1" maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
    <xs:complexType name="agency">

```

**BusTime** **[®]** **Developer API Guide** **59**


**Error Descriptions**

```
         <xs:sequence>
             <xs:element name="agencyid" type="xs:int" minOccurs="0" maxOccurs="1"/>
             <xs:element name="shortname" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
             <xs:element name="longname" type="xs:string" minOccurs="1"
             maxOccurs="1"/>
         </xs:sequence>
    </xs:complexType>
</xs:schema>

```

**Example:**
The XML document below is a response to the following request:

**Request**
http://localhost:8080/bustime/api/v3/getagencies?key=89dj2he89d8j3j3ksjhdue93j

**Response**

```
<?xml version=”1.0”?>
<bustime-response>
    <agency>
         <agencyid>1</agencyid>
         <shortname>PT</shortname>
         <longname>Pierce Transit</longname>
    </agency>
    <agency>
         <agencyid>2</agencyid>
         <shortname>ST</shortname>
         <longname>Sound Transit</longname>
    </agency>
    ...
</bustime-response>

```

**Request**
http://localhost:8080/bustime/api/v3/getroutes?key=89dj2he89d8j3j3ksjhdue93j&format=json

**Response**
```
{
    "bustime-response": {
         "agencies": [
             {
                 "agencyid": 1,
                 "shortname": "PT”,
                 "longname": "Pierce Transit"
             },
             {
                 "agencyid": 2,
                 "shortname": "ST”,
                 "longname": "Sound Transit"
             },
             ...
```

]
```
    }
}

```

**60** **BusTime** **[®]** **Developer API Guide**


##### **4 Version 3 Release Notes**

Version 3 of the Developer API contains a number of changes:

  - The URL of the request changes.

  - Most calls now support an **rtpidatafeed** parameter to query desired feeds of multi-feed
systems

  - In a multi-feed system, some calls now return an **rtpidatafeed** element in their results

  - The results of some calls are now affected by detours which introduces a new
**getdetours** call.

  - The results of some calls are now affected by disruption management changes

  - Standardization of format of the Route Directions call

  - Changes to the Real Time Passenger Information call

  - Miscellaneous fixes

###### **4.1 Calling Version 3**

Version 3 of the API is used by including “v3”in the request URL as follows:

http://localhost:8080/bustime/api/v3/getroutes?key=89dj2he89d8j3j3ksjhdue93j

###### **4.2 Inclusion of “rtpidatafeed” parameter in most calls**

Version 3 of the API greatly enhances support of systems with multiple configured feeds. A
“multi-feed” system is one which services more than one agency, source, or data transmission.
API users can determine if their working system is multi-feed by using the **getrtpidatafeeds**
call. If the call returns more than one feed, then the system is multi-feed, even if only one feed
is enabled.

A feed’s enabled state is relevant to the user, however. . The enabled state of a feed is returned
in the **getrtpidatafeeds** call. Making any call with an **rtpidatafeed** parameter of a disabled
feed’s name will result in an “Invalid RTPI Data Feed parameter” error. A Feed must be
enabled in order to offer any data through the API. Also, some calls now _require_ an
**rtpidatafeed** parameter when working within a multi-feed system in order to properly
determine what the user is requesting.

The following calls now support or better support the **rtpidatafeed** parameter:

- Vehicles

- Routes

- Route Directions

- Stops

- Patterns

- Predictions


**BusTime** **[®]** **Developer API Guide** **61**


**Error Descriptions**


- Service Bulletins

API users should review the reference for each call’s handling of this new parameter.

###### **4.3 Inclusion of “rtpidatafeed” element for multi-feed systems**

In a multi-feed system, some calls will return an **rtpidatafeed** element within the results.
Generally, this element denotes the feed that its parent’s data belongs to. This element helps
API users differentiate objects such as routes and stops with ids that are present across multiple
feeds.

The following calls now return an **rtpidatafeed** element within a multi-feed system:

- Vehicles

- Routes

- Service Bulletins

###### **4.4 Introduction of the Detours call**

Some calls such as Stops and Patterns can now be affected by detours. These calls will
reference detour ids which can be referenced in the new Detours call. See section 1.8 and the
reference for the Detours call for more information.

###### **4.5 Introduction of Disruption Management changes**

Some calls are now affected by disruption management changes. For example, a prediction can
now be marked as canceled if the vehicle will skip the associated stop. If the developer wishes
to support disruption management, recurring requests to route data calls will be needed. See
section 1.8 for more information.

###### **4.6 Standardization of the Route Directions call**

Version 2 introduced the multi-feed concept to the Route Directions call. In that version, the
results for a multi-feed system had localization data but a single feed did not. In v3, the Route
Directions call will always be formatted to show locale-specific data. See the reference for
Route Directions for examples of this format.

###### **4.7 Changes to Real Time Passenger Information call**

Version 3 introduces some new elements and element name changes in order to provide
developers with more valuable and more accurate information about RTPI feeds:

- The `agency e` lement is now `displayname`

- The call now returns disabled feeds in addition to enabled ones

- The `enabled` boolean element has been added

###### **4.8 Miscellaneous Fixes**

- **Predictions**

`o` Using this call in a multi-feed system now appropriately returns “No Service

Scheduled” for given **stpid** s

`o` All given **stpid** s/ **vid** s are now in some way represented in the result, either with

predictions or an error


**62** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**


- **Service Bulletins**

`o` Results are now properly filtered by combinations of **rt**, **rtdir**, and **stpid** instead of

being expanded by them

`o` An error is now properly returned if a given **stpid** is not along the given **rt** and **rtdir**

`o` Any invalid parameters given for this call are now ignored and return an error;

bulletins will be returned for whatever valid parameters remain

- **Stops -** Passing in a rtpidatafeed parameter along with stpid(s) no longer results in an empty
response

- Other Notes

`o` The **dir** and **rtdir** parameters now use the id of the direction instead of the localized

name

`o` Much of the core API code has been optimized and primed for versioning, which

should increase response time for users

`o` New error messages have been added to support new functionality in this version

`o` To allow easier transitioning from legacy versions to v3, the inconsistency of

pluralizations of JSON arrays has not been changed


**BusTime** **[®]** **Developer API Guide** **63**


**Error Descriptions**

##### **5 Dynamic Action Types**

This section describes the dynamic action type identifiers available throughout the BusTime [®]
Developer API’s **dyn** elements.












|ID|Name|Description|
|---|---|---|
|0|None|No change.|
|1|Canceled|The event or trip has been canceled.|
|2|Reassigned|The event or trip has been moved to a different work (to be<br>handled by a different vehicle or operator).|
|3|Shifted|The time of this event, or the entire trip, has been moved.|
|4|Expressed|The event is “drop-off only” and will not stop to pick up<br>passengers.|
|6|Stops Affected|This trip has events that are affected by Disruption Management<br>changes, but the trip itself is not affected.|
|8|New Trip|This trip was created dynamically and does not appear in the TA<br>schedule.|
|9|Partial Trip|This trip has been split, and this part of the split is using the<br>original trip identifier(s).<br>-or-<br>The trip has been short-turned leading to the removal of short-<br>turned stops from the trip resulting in the trip being partial.|
|10|Partial Trip New|This trip has been split, and this part of the split has been<br>assigned a new trip identifier(s).|
|12|Delayed Cancel|This event or trip has been marked as canceled, but the<br>cancellation should not be shown to the public.|
|13|Added Stop|This event has been added to the trip. It was not originally<br>scheduled.|
|14|Unknown Delay|This trip has been affected by a delay.|
|15|Unknown Delay New|This trip, which was created dynamically, has been affected by a<br>delay.|
|16|Invalidated Trip|This trip has been invalidated. Predictions for it should not be<br>shown to the public.|
|17|Invalidated Trip New|This trip, which was created dynamically, has been invalidated.<br>Predictions for it should not be shown to the public.|
|18|Cancelled Trip New|This trip, which was created dynamically, has been canceled.|
|19|Stops Affected New|This trip, which was created dynamically, has events that are<br>affected by Disruption Management changes, but the trip itself is<br>not affected.|



**64** **BusTime** **[®]** **Developer API Guide**


**Error Descriptions**

##### **6 Error Descriptions**

This section describes all possible error responses that can be received from the BusTime [®]
Developer API.




























|Error Message|Related API Calls|Description|
|---|---|---|
|Internal server error -<br>Unable to complete<br>request at this time|All|The most general error message, given<br>when we cannot find a more specific error<br>message to send.|
|No API access<br>permitted|All|The Developer API has been disabled by<br>the Transit Authority.|
|No API access key<br>supplied|All|The 'key=<DevKey>' parameter is missing<br>from the API request.|
|Invalid API access key<br>supplied|All|The given Developer key is not assigned to<br>any users.|
|No version requested|All|The request URL is missing the version.|
|Unsupported version<br>requested|All|The request URL contains an unsupported<br>version.|
|Unsupported function|N/A|The request contains a function name that<br>is not supported by the API.|
|Transaction limit for<br>current day has been<br>exceeded.|All|The user, identified by the Developer Key,<br>has already reached the maximum number<br>of API calls allowed for the day.|
|Invalid locale<br>parameter|All|The requested locale string is not in a<br>proper format.  The proper format is "la"<br>where la is a legal ISO 639 code.|
|Format parameter must<br>be xml or json|All|The 'format' parameter is invalid. The<br>value must be "xml" or "json".|
|No data found for<br>parameter(s)|All except**gettime and**<br>**getenhanceddetours**|No results were found that matched the<br>given parameters.|
|No parameter provided|**getpattern**|Required 'rt' or 'pid' parameters are<br>missing.|
|No parameter provided|**getpredictions**|The required 'stpid' or 'vid' parameters are<br>missing.|
|No parameter provided|**getservicebulletins**|The required 'rt' or 'stpid' parameters are<br>missing.|
|dir parameter missing|**getstops**|The required 'dir' parameter is missing.|
|rt parameter missing|**getdirections**, <br>**getstops**, <br>**getservicebulletins**|The required 'rt' parameter is missing.|
|Either rt or vid<br>parameter must be<br>specified|**getvehicles**|The request is required to contain either a<br>'rt' or 'vid' parameter.|
|Invalid parameter<br>provided|**getpatterns**, <br>**getpredictions,**|The listed parameter(s) does not match any<br>known ID.|



**BusTime** **[®]** **Developer API Guide** **65**


**Error Descriptions**




























|Error Message|Related API Calls|Description|
|---|---|---|
||**getdetours**||
|Maximum number of<br>pid identifiers exceeded|**getpattern**|The 'pid' parameter contains more than 10<br>pattern IDs.|
|Invalid top parameter<br>provided|**getpredictions**|The 'top' parameter is not an integer or<br>contains extra characters.  For instance<br>"top=10" is legal but "top=10." is not.|
|Maximum number of<br><x> identifiers<br>exceeded|**getpredictions**, <br>**getvehicles**|The 'stpid' or 'vid' parameter contains too<br>many IDs. <x> shows the maximum<br>allowed in a single request.|
|No arrival times|**getpredictions**|The given stop has no scheduled arrival<br>times.|
|No service scheduled|**getpredictions**|The given stop has no service scheduled.|
|Invalid RTPI Data Feed<br>parameter|All except**gettime** and<br>**getlocalelist**|The given 'rtpidatafeed' is an invalid or<br>disabled feed.|
|No RTPI Data Feed<br>parameter provided|**getdirections**, <br>**getstops**, <br>**getpatterns**, <br>**getpredictions**, <br>**getservicebulletins**|The required 'rtpidatafeed' parameter is<br>missing.|
|The rtpidatafeed does<br>not support this<br>function|**getvehicles**, <br>**getservicebulletins,**<br>**getdetours,**<br>**getenhanceddetours**|The given 'rtpidatafeed' is a valid feed but<br>does not support the call’s functionality.|



**66** **BusTime** **[®]** **Developer API Guide**


### **America’s Leader in Transit Technology**



