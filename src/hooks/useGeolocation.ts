import {useState,useEffect,useCallback} from "react"

interface GeolocationState{
  latitude:number|null
  longitude:number|null
  accuracy:number|null
  error:string|null
  loading:boolean
  permissionDenied:boolean
}

export function useGeolocation(options?:PositionOptions){
  const [state,setState]=useState<GeolocationState>({
    latitude:null,
    longitude:null,
    accuracy:null,
    error:null,
    loading:true,
    permissionDenied:false
  })

  const [watchId,setWatchId]=useState<number|null>(null)

  const startWatching=useCallback(()=>{
    if(!("geolocation" in navigator)){
      setState(s=>({
        ...s,
        error:"Geolocation not supported",
        loading:false
      }))
      return
    }

    const id=navigator.geolocation.watchPosition(
      pos=>{
        setState({
          latitude:pos.coords.latitude,
          longitude:pos.coords.longitude,
          accuracy:pos.coords.accuracy,
          error:null,
          loading:false,
          permissionDenied:false
        })
      },
      err=>{
        setState({
          latitude:null,
          longitude:null,
          accuracy:null,
          error:
            err.code===err.PERMISSION_DENIED
              ?"Location permission denied"
              :err.code===err.POSITION_UNAVAILABLE
              ?"Location unavailable"
              :"Location request timed out",
          loading:false,
          permissionDenied:err.code===err.PERMISSION_DENIED
        })
      },
      {
        enableHighAccuracy:true,
        maximumAge:0,
        timeout:15000,
        ...options
      }
    )

    setWatchId(id)
  },[options])

  const stopWatching=useCallback(()=>{
    if(watchId!==null){
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
  },[watchId])

  // 🔥 AUTO-START GPS ON MOUNT (CRITICAL FIX)
  useEffect(()=>{
    startWatching()
    return()=>stopWatching()
  },[startWatching,stopWatching])

  return{
    ...state,
    requestPermission:startWatching,
    stopWatching,
    isWatching:watchId!==null
  }
}
